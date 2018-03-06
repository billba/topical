import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import { TopicClass, SimpleForm, TextPromptTopicClass, prettyConsole } from '../src/topical';

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

const showAlarms = new TopicClass<any, ShowAlarmInitArgs>('showAlarms')
    .init((c, t) => {
        if (t.args.alarms.length === 0)
            c.reply(`You haven't set any alarms.`);
        else
            c.reply(`You have the following alarms set:\n${listAlarms(t.args.alarms)}`);

        t.returnToParent();
    });

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
    .prompt((context, topicContext) => {
        context.reply(topicContext.instance.state.promptState.prompt);
    });

const deleteAlarmClass = new TopicClass<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs>('deleteAlarm')
    .init(async (c, t) => {
        if (t.args.alarms.length === 0) {
            c.reply(`You don't have any alarms.`);
            t.returnToParent();
            return;
        }

        t.instance.state.alarms = t.args.alarms;

        t.instance.state.child = await t.createTopicInstance(textPromptClass, {
            name: 'whichAlarm',
            promptState: {
                prompt: `Which alarm do you want to delete?\n${listAlarms(t.instance.state.alarms)}`,
            },
        });
    })
    .onReceive(async (c, t) => {
        await t.dispatch(t.instance.state.child);
    })
    .onChildReturn(textPromptClass, async (c, t) => {
        switch (t.args.name) {
            case 'whichAlarm':
                t.instance.state.alarmName = t.args.result.value;
                t.instance.state.child = await t.createTopicInstance(textPromptClass, {
                    name: 'confirm',
                    promptState: {
                        prompt: `Are you sure you want to delete alarm "${t.args.result.value}"? (yes/no)"`,
                    },
                });
                break;
            case 'confirm':
                t.returnToParent(t.args.result.value === 'yes'
                    ? {
                        alarmName: t.instance.state.alarmName
                    }
                    : undefined
                )
                break;
        }
    });

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const simpleForm = new SimpleForm('simpleForm');

const helpText = `I know how to set, show, and delete alarms.`;

const alarmBotClass = new TopicClass<undefined, AlarmBotState, undefined>('alarmBot')
    .init((c, t) => {
        c.reply(`Welcome to Alarm Bot!\n${helpText}`);
        t.instance.state.alarms = [];
    })
    .onReceive(async (c, t) => {
        if (await t.dispatch(t.instance.state.child))
            return;

        if (c.request.type === 'message') {
            if (/set|add|create/i.test(c.request.text)) {
                t.instance.state.child = await t.createTopicInstance(simpleForm, {
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
            } else if (/show|list/i.test(c.request.text)) {
                t.instance.state.child = await t.createTopicInstance(showAlarms, {
                    alarms: t.instance.state.alarms
                });
            } else if (/delete|remove/i.test(c.request.text)) {
                t.instance.state.child = await t.createTopicInstance(deleteAlarmClass, {
                    alarms: t.instance.state.alarms
                });
            } else {
                c.reply(helpText);
            }
        }
    })
    .onChildReturn(simpleForm, (c, t) => {
        t.instance.state.alarms.push({ ... t.args.form } as any as Alarm);

        c.reply(`Alarm successfully added!`);
    })
    .onChildReturn(showAlarms)
    .onChildReturn(deleteAlarmClass, (c, t) => {
        if (t.args) {
            t.instance.state.alarms = t.instance.state.alarms
                .filter(alarm => alarm.name !== t.args.alarmName);

            c.reply(`Alarm "${t.args.alarmName}" has been deleted.`)
        } else {
            c.reply(`Okay, the status quo has been preserved.`)
        }
    })
    .afterChildReturn((c, t) => {
        t.instance.state.child = undefined;
    });
