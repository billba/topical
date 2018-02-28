import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import { TopicClass, SimpleForm, StringPrompt, prettyConsole } from '../src/topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use(prettyConsole)
    .onReceive(async c => {
        await TopicClass.do(c, () => alarmBot.createInstance(c));
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

interface DeleteAlarmCallbackArgs {
    alarmName: string;
}

const stringPrompt = new StringPrompt('stringPrompt');

const deleteAlarm = new TopicClass<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmCallbackArgs>('deleteAlarm')
    .init(async (c, t) => {
        if (t.args.alarms.length === 0) {
            c.reply(`You don't have any alarms.`);
            t.returnToParent();
            return;
        }

        t.instance.state.alarms = t.args.alarms;

        t.instance.state.child = await t.createTopicInstance(stringPrompt, {
            name: 'whichAlarm',
            prompt: `Which alarm do you want to delete?\n${listAlarms(t.instance.state.alarms)}`,
        });
    })
    .onReceive(async (c, t) => {
        if (t.instance.state.child)
            await t.dispatchToInstance(t.instance.state.child);
    })
    .onChildReturn(stringPrompt, async (c, t) => {
        switch (t.args.name) {
            case 'whichAlarm':
                t.instance.state.alarmName = t.args.value;
                t.instance.state.child = await t.createTopicInstance(stringPrompt, {
                    name: 'confirm',
                    prompt: `Are you sure you want to delete alarm "${t.args.value}"? (yes/no)"`,
                });
                break;
            case 'confirm':
                t.returnToParent(t.args.value === 'yes'
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

const alarmBot = new TopicClass<undefined, AlarmBotState, undefined>('alarmBot')
    .init((c, t) => {
        c.reply(`Welcome to Alarm Bot!\n${helpText}`);
        t.instance.state.alarms = [];
    })
    .onReceive(async (c, t) => {
        if (t.instance.state.child)
            return t.dispatchToInstance(t.instance.state.child);

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
                t.instance.state.child = await t.createTopicInstance(deleteAlarm, {
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
    .onChildReturn(deleteAlarm, (c, t) => {
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
