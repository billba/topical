import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, TextPrompt, prettyConsole, WSTelemetry, consoleOnTurn, doTopic } from '../src/topical';
import { SimpleForm, SimpleFormSchema } from './SimpleForm';

interface Alarm {
    name: string;
    when: string;
}

const listAlarms = (alarms: Alarm[]) => alarms
    .map(alarm => `* "${alarm.name}" set for ${alarm.when}`)
    .join('\n');

interface ShowAlarmBegin {
    alarms: Alarm[]
}

class ShowAlarms extends Topic<ShowAlarmBegin> {

    async onBegin (
        args: ShowAlarmBegin,
    ) {

        if (args.alarms.length === 0)
            await this.send(`You haven't set any alarms.`);
        else
            await this.send(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

        this.returnToParent();
    }
}
ShowAlarms.register();

interface DeleteAlarmBegin {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    child: string;
}

interface DeleteAlarmReturn {
    alarmName: string;
}

class DeleteAlarm extends Topic<DeleteAlarmBegin, DeleteAlarmState, DeleteAlarmReturn> {

    async onBegin (
        args: DeleteAlarmBegin,
    ) {
        if (args.alarms.length === 0) {
            await this.send(`You don't have any alarms.`);
            return this.returnToParent();
        }

        this.state.alarms = args.alarms;

        await this.beginChild(TextPrompt, {
            name: 'whichAlarm',
            prompt: `Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`,
        });
    }

    async onTurn () {
        await this.dispatchToChild();
    }

    async onChildReturn(child: TextPrompt) {
        switch (child.return!.args!.name) {

            case 'whichAlarm':
                this.state.alarmName = child.return!.result.value!;
                await this.beginChild(TextPrompt, {
                    name: 'confirm',
                    prompt: `Are you sure you want to delete alarm "${child.return!.result.value}"? (yes/no)"`,
                });
                break;

            case 'confirm':
                this.clearChildren();
                this.returnToParent(child.return!.result.value === 'yes'
                    ? {
                        alarmName: this.state.alarmName
                    }
                    : undefined
                )
                break;

            default:
                throw `unknown prompt name ${child.return!.args!.name}`;
        }
    }
}
DeleteAlarm.register();

interface AlarmBotState {
    alarms: Alarm[];
}

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends Topic<any, AlarmBotState> {

    async onBegin () {
        await this.send(`Welcome to Alarm Bot!\n${helpText}`);
        this.state.alarms = [];
    }

    async onTurn () {
        if (await this.dispatchToChild())
            return;

        if (this.text) {
            if (/set|add|create/i.test(this.text)) {
                await this.beginChild(SimpleForm, {
                    name: {
                        type: 'string',
                        prompt: 'What do you want to call it?',
                    },
                    when: {
                        type: 'string',
                        prompt: 'For when do you want to set it?',
                    },
                } as SimpleFormSchema);
            } else if (/show|list/i.test(this.text)) {
                await this.beginChild(ShowAlarms, {
                    alarms: this.state.alarms
                });
            } else if (/delete|remove/i.test(this.text)) {
                await this.beginChild(DeleteAlarm, {
                    alarms: this.state.alarms
                });
            } else {
                await this.send(helpText);
            }
        }
    }

    async onChildReturn(
        child: Topic,
    ) {
        if (child instanceof SimpleForm) {
            this.state.alarms.push({ ... child.return! } as any as Alarm);
            await this.send(`Alarm successfully added!`);
        } else if (child instanceof DeleteAlarm) {
            if (child.return) {
                this.state.alarms = this.state.alarms
                    .filter(alarm => alarm.name !== child.return!.alarmName);

                await this.send(`Alarm "${child.return!.alarmName}" has been deleted.`)
            } else {
                await this.send(`Okay, the status quo has been preserved.`)
            }
        } else if (!(child instanceof ShowAlarms)) {
            throw `unexpected child topic`;
        }

        this.clearChildren();
    }
}
AlarmBot.register();

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter()
    .use(prettyConsole);

consoleOnTurn(adapter, context => doTopic(AlarmBot, context));

