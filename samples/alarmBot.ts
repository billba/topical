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

class ShowAlarms extends Topic<Alarm[]> {

    async onStart (
        args: Alarm[],
    ) {

        if (args.length === 0)
            await this.send(`You haven't set any alarms.`);
        else
            await this.send(`You have the following alarms set:\n${listAlarms(args)}`);

        await this.end();
    }
}
ShowAlarms.register();

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    child: string;
}

class DeleteAlarm extends Topic<Alarm[], DeleteAlarmState, string> {

    async onStart (
        args: Alarm[],
    ) {
        if (args.length === 0) {
            await this.send(`You don't have any alarms.`);
            await this.end();
            return;
        }

        this.state.alarms = args;

        await this.startChild(TextPrompt, {
            name: 'whichAlarm',
            prompt: `Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`,
        });
    }

    async onDispatch () {
        await this.dispatchToChild();
    }

    async onChildReturn(child: TextPrompt) {
        switch (child.return!.args!.name) {

            case 'whichAlarm':
                this.state.alarmName = child.return!.result.value!;
                await this.startChild(TextPrompt, {
                    name: 'confirm',
                    prompt: `Are you sure you want to delete alarm "${child.return!.result.value}"? (yes/no)"`,
                });
                break;

            case 'confirm':
                await this.end(child.return!.result.value === 'yes'
                    ? this.state.alarmName
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

    async onStart () {
        await this.send(`Welcome to Alarm Bot!\n${helpText}`);
        this.state.alarms = [];
    }

    async onDispatch () {
        if (await this.dispatchToChild())
            return;

        if (this.text) {
            if (/set|add|create/i.test(this.text)) {
                await this.startChild(SimpleForm, {
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
                await this.startChild(ShowAlarms, this.state.alarms);
            } else if (/delete|remove/i.test(this.text)) {
                await this.startChild(DeleteAlarm, this.state.alarms);
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
                    .filter(alarm => alarm.name !== child.return!);

                await this.send(`Alarm "${child.return!}" has been deleted.`)
            } else {
                await this.send(`Okay, the status quo has been preserved.`)
            }
        } else if (!(child instanceof ShowAlarms)) {
            throw `unexpected child topic`;
        }
    }
}
AlarmBot.register();

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter()
    .use(prettyConsole);

consoleOnTurn(adapter, context => doTopic(AlarmBot, context));

