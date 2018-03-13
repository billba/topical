import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import { Topic, SimpleForm, TextPromptTopic, TopicInstance, TopicWithChild, prettyConsole, WSTelemetry } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(prettyConsole)
    .onReceive(async c => {
        await Topic.do(c, () => alarmBotClass.createInstance(c));
    });

interface Alarm {
    name: string;
    when: string;
}

const listAlarms = (alarms: Alarm[]) => alarms
    .map(alarm => `* "${alarm.name}" set for ${alarm.when}`)
    .join('\n');

interface SetAlarmState {
    alarm: Partial<Alarm>;
    child: string;
}

interface ShowAlarmInitArgs {
    alarms: Alarm[]
}

class ShowAlarms extends Topic<ShowAlarmInitArgs> {
    async init (
        context: BotContext,
        instance: TopicInstance,
        args: ShowAlarmInitArgs,
    ) {
        if (args.alarms.length === 0)
            context.reply(`You haven't set any alarms.`);
        else
            context.reply(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

        this.returnToParent(instance);
    }
}

const showAlarms = new ShowAlarms();

interface DeleteAlarmInitArgs {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    child: string;
}

interface DeleteAlarmReturnArgs {
    alarmName: string;
}

interface SimpleFormPromptState {
    prompt: string;
}

const textPromptClass = new TextPromptTopic()
    .maxTurns(100)
    .prompter(async (context, instance) => {
        context.reply(instance.state.promptState.prompt);
    });

class DeleteAlarm extends TopicWithChild<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs> {
    constructor (name?: string) {
        super(name);

        this
            .onChildReturn(textPromptClass, async (context, instance, childInstance) => {
                switch (childInstance.returnArgs.name) {
                    case 'whichAlarm':
                        instance.state.alarmName = childInstance.returnArgs.result.value;
                        this.setChild(context, instance, await textPromptClass.createInstance(context, instance, {
                            name: 'confirm',
                            promptState: {
                                prompt: `Are you sure you want to delete alarm "${childInstance.returnArgs.result.value}"? (yes/no)"`,
                            },
                        }));
                        break;
                    case 'confirm':
                        this.clearChild(context, instance);
                        this.returnToParent(instance, childInstance.returnArgs.result.value === 'yes'
                            ? {
                                alarmName: instance.state.alarmName
                            }
                            : undefined
                        )
                        break;
                    default:
                        throw `Not familiar with prompt named ${childInstance.returnArgs.name}`;
                }
            });
    }

    async init (
        context: BotContext,
        instance: TopicInstance<DeleteAlarmState, DeleteAlarmReturnArgs>,
        args: DeleteAlarmInitArgs,
    ) {
        if (args.alarms.length === 0) {
            context.reply(`You don't have any alarms.`);
            return this.returnToParent(instance);
        }

        instance.state.alarms = args.alarms;

        this.setChild(context, instance, await textPromptClass.createInstance(context, instance, {
            name: 'whichAlarm',
            promptState: {
                prompt: `Which alarm do you want to delete?\n${listAlarms(instance.state.alarms)}`,
            },
        }));
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<DeleteAlarmState, DeleteAlarmReturnArgs>,
    ) {
        await this.dispatchToChild(context, instance);
    }
}

const deleteAlarmClass = new DeleteAlarm();

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const simpleForm = new SimpleForm();

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends TopicWithChild<undefined, AlarmBotState, undefined> {
    constructor (name?: string) {
        super(name);

        this
            .onChildReturn(simpleForm, async (context, instance, childInstance) => {
                instance.state.alarms.push({ ... childInstance.returnArgs.form } as any as Alarm);
                context.reply(`Alarm successfully added!`);
            })
            .onChildReturn(showAlarms)
            .onChildReturn(deleteAlarmClass, async (context, instance, childInstance) => {
                if (childInstance.returnArgs) {
                    instance.state.alarms = instance.state.alarms
                        .filter(alarm => alarm.name !== childInstance.returnArgs.alarmName);

                    context.reply(`Alarm "${childInstance.returnArgs.alarmName}" has been deleted.`)
                } else {
                    context.reply(`Okay, the status quo has been preserved.`)
                }
            })
            .afterChildReturn(async (context, instance, childInstance) => {
                this.clearChild(context, instance);
            });
    }

    async init (
        context: BotContext,
        instance: TopicInstance,
    ) {
        context.reply(`Welcome to Alarm Bot!\n${helpText}`);
        instance.state.alarms = [];
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<AlarmBotState>,
    ) {
        if (context.request.type === 'message' && context.request.text === '#orphan') {
            instance.state.child = undefined;
        }

        if (await this.dispatchToChild(context, instance))
            return;

        if (context.request.type === 'message') {
            if (/set|add|create/i.test(context.request.text)) {
                this.setChild(context, instance,  await simpleForm.createInstance(context, instance, {
                    schema: {
                        name: {
                            type: 'string',
                            prompt: 'What do you want to call it?'
                        },
                        when: {
                            type: 'string',
                            prompt: 'For when do you want to set it?'
                        }
                    }
                }));
            } else if (/show|list/i.test(context.request.text)) {
                this.setChild(context, instance, await showAlarms.createInstance(context, instance, {
                    alarms: instance.state.alarms
                }));
            } else if (/delete|remove/i.test(context.request.text)) {
                this.setChild(context, instance, await deleteAlarmClass.createInstance(context, instance, {
                    alarms: instance.state.alarms
                }));
            } else {
                context.reply(helpText);
            }
        }
    }
}

const alarmBotClass = new AlarmBot();
