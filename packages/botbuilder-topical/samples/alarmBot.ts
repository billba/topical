import { BotContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, SimpleForm, TextPromptTopic, TopicInstance, TopicWithChild, prettyConsole, WSTelemetry } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async c => {
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
            await context.sendActivity(`You haven't set any alarms.`);
        else
            await context.sendActivity(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

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
        await context.sendActivity(instance.state.promptState.prompt);
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
            await context.sendActivity(`You don't have any alarms.`);
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
                await context.sendActivity(`Alarm successfully added!`);
            })
            .onChildReturn(showAlarms)
            .onChildReturn(deleteAlarmClass, async (context, instance, childInstance) => {
                if (childInstance.returnArgs) {
                    instance.state.alarms = instance.state.alarms
                        .filter(alarm => alarm.name !== childInstance.returnArgs.alarmName);

                    await context.sendActivity(`Alarm "${childInstance.returnArgs.alarmName}" has been deleted.`)
                } else {
                    await context.sendActivity(`Okay, the status quo has been preserved.`)
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
        await context.sendActivity(`Welcome to Alarm Bot!\n${helpText}`);
        instance.state.alarms = [];
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<AlarmBotState>,
    ) {
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
                await context.sendActivity(helpText);
            }
        }
    }
}

const alarmBotClass = new AlarmBot();
