import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import { TopicClass, SimpleForm, TextPromptTopicClass, prettyConsole, TopicInstance } from '../src/topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(prettyConsole)
    .onReceive(async c => {
        await TopicClass.do(c, () => alarmBotClass.createInstance(c));
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

class ShowAlarms extends TopicClass<ShowAlarmInitArgs> {
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

const showAlarms = new ShowAlarms('showAlarms');

interface DeleteAlarmInitArgs {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    confirm: boolean;
    child: string;
}

interface DeleteAlarmReturnArgs {
    alarmName: string;
}

interface SimpleFormPromptState {
    prompt: string;
}

const textPromptClass = new TextPromptTopicClass('stringPrompt')
    .maxTurns(100)
    .prompt(async (context, instance) => {
        context.reply(instance.state.promptState.prompt);
    });

class DeleteAlarmClass extends TopicClass<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs> {
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

        instance.state.child = await textPromptClass.createInstance(context, instance, {
            name: 'whichAlarm',
            promptState: {
                prompt: `Which alarm do you want to delete?\n${listAlarms(instance.state.alarms)}`,
            },
        });
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<DeleteAlarmState, DeleteAlarmReturnArgs>,
    ) {
        await this.dispatch(context, instance.state.child);
    }

    async onChildReturn (
        context: BotContext,
        instance: TopicInstance<DeleteAlarmState, DeleteAlarmReturnArgs>,
        childInstance: TopicInstance,
    ) {
        switch (childInstance.returnArgs.name) {
            case 'whichAlarm':
                instance.state.alarmName = childInstance.returnArgs.result.value;
                instance.state.child = await textPromptClass.createInstance(context, instance, {
                    name: 'confirm',
                    promptState: {
                        prompt: `Are you sure you want to delete alarm "${childInstance.returnArgs.result.value}"? (yes/no)"`,
                    },
                });
                break;
            case 'confirm':
                this.returnToParent(instance, childInstance.returnArgs.result.value === 'yes'
                    ? {
                        alarmName: instance.state.alarmName
                    }
                    : undefined
                )
                break;
        }
    }
}

const deleteAlarmClass = new DeleteAlarmClass('deleteAlarm');

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const simpleForm = new SimpleForm('simpleForm');

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBotClass extends TopicClass<undefined, AlarmBotState, undefined> {
    async init (
        context: BotContext,
        instance: TopicInstance,
    ) {
        context.reply(`Welcome to Alarm Bot!\n${helpText}`);
        instance.state = {
            alarms: [],
            child: undefined
        }
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<AlarmBotState>,
    ) {
        if (await this.dispatch(context, instance.state.child))
            return;

        if (context.request.type === 'message') {
            if (/set|add|create/i.test(context.request.text)) {
                instance.state.child = await simpleForm.createInstance(context, instance, {
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
                });
            } else if (/show|list/i.test(context.request.text)) {
                instance.state.child = await showAlarms.createInstance(context, instance, {
                    alarms: instance.state.alarms
                });
            } else if (/delete|remove/i.test(context.request.text)) {
                instance.state.child = await deleteAlarmClass.createInstance(context, instance, {
                    alarms: instance.state.alarms
                });
            } else {
                context.reply(helpText);
            }
        }
    }

    async onChildReturn (
        context: BotContext,
        instance: TopicInstance<AlarmBotState>,
        childInstance: TopicInstance,
    ) {
        switch (childInstance.topicName) {
            case 'simpleForm':
                instance.state.alarms.push({ ... childInstance.returnArgs.form } as any as Alarm);
                context.reply(`Alarm successfully added!`);
                break;
            case 'showAlarms':
                break;
            case 'deleteAlarm':
                if (childInstance.returnArgs) {
                    instance.state.alarms = instance.state.alarms
                        .filter(alarm => alarm.name !== childInstance.returnArgs.alarmName);

                    context.reply(`Alarm "${childInstance.returnArgs.alarmName}" has been deleted.`)
                } else {
                    context.reply(`Okay, the status quo has been preserved.`)
                }
                break;
        }

        instance.state.child = undefined;
    }
}

const alarmBotClass = new AlarmBotClass('alarmBot');
