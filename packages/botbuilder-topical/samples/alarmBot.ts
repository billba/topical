import { BotContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, SimpleForm, TextPrompt, TopicWithChild, prettyConsole, WSTelemetry } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async c => {
        await AlarmBot.do(c);
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
    async onBegin (
        args: ShowAlarmInitArgs,
    ) {
        if (args.alarms.length === 0)
            await this.context.sendActivity(`You haven't set any alarms.`);
        else
            await this.context.sendActivity(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

        this.returnToParent();
    }
}

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

class PromptForText extends TextPrompt {

    maxTurns = 100;

    async prompter() {
        await this.context.sendActivity(this.state.args.prompt);
    }
}

class DeleteAlarm extends TopicWithChild<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs> {

    static subtopics = [PromptForText];

    async onBegin (
        args: DeleteAlarmInitArgs,
    ) {
        if (args.alarms.length === 0) {
            await this.context.sendActivity(`You don't have any alarms.`);
            return this.returnToParent();
        }

        this.state.alarms = args.alarms;

        await this.createChild(PromptForText, {
            name: 'whichAlarm',
            args: {
                prompt: `Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`,
            },
        });
    }

    async onTurn () {
        await this.dispatchToChild();
    }

    async onChildReturn(child: Topic) {
        if (!(child instanceof PromptForText))
            throw "unexpected child topic";
        
        switch (child.return.name) {
            case 'whichAlarm':
                this.state.alarmName = child.return.result.value!;
                await this.createChild(PromptForText, {
                    name: 'confirm',
                    args: {
                        prompt: `Are you sure you want to delete alarm "${child.return.result.value}"? (yes/no)"`,
                    },
                });
                break;

            case 'confirm':
                this.clearChild();
                this.returnToParent(child.return.result.value === 'yes'
                    ? {
                        alarmName: this.state.alarmName
                    }
                    : undefined
                )
                break;

            default:
                throw `unknwon prompt name ${child.return.name}`;
        }
    }

}

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends TopicWithChild<any, AlarmBotState, any> {

    static subtopics = [DeleteAlarm, ShowAlarms, SimpleForm];

    async onBegin () {
        await this.context.sendActivity(`Welcome to Alarm Bot!\n${helpText}`);
        this.state.alarms = [];
    }

    async onTurn () {
        if (await this.dispatchToChild())
            return;

        if (this.context.request.type === 'message') {
            const text = this.context.request.text;

            if (/set|add|create/i.test(text)) {
                await this.createChild(SimpleForm, {
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
            } else if (/show|list/i.test(text)) {
                await this.createChild(ShowAlarms, {
                    alarms: this.state.alarms
                });
            } else if (/delete|remove/i.test(text)) {
                await this.createChild(DeleteAlarm, {
                    alarms: this.state.alarms
                });
            } else {
                await this.context.sendActivity(helpText);
            }
        }
    }

    async onChildReturn(child: Topic) {
        if (child instanceof SimpleForm) {
            this.state.alarms.push({ ... child.return.form } as any as Alarm);
            await this.context.sendActivity(`Alarm successfully added!`);
        } else if (child instanceof DeleteAlarm) {
            if (child.return) {
                this.state.alarms = this.state.alarms
                    .filter(alarm => alarm.name !== child.return.alarmName);

                await this.context.sendActivity(`Alarm "${child.return.alarmName}" has been deleted.`)
            } else {
                await this.context.sendActivity(`Okay, the status quo has been preserved.`)
            }
        } else if (!(child instanceof ShowAlarms)) {
            throw `unexpected child topic`;
        } 
        this.clearChild();
    }
}
