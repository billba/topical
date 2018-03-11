import { ConsoleAdapter } from 'botbuilder-node';
import { Bot } from 'botbuilder';
import { Topic, prettyConsole, TextPromptTopic } from '../src/topical';
// import { wstelemetry } from './wstelemetry';
// Topic.telemetry = wstelemetry;

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(prettyConsole)
    .onReceive(async c => {
        await Topic.do(c, () => new AlarmBot().createInstance(c))
    });

import { SimpleFormInitArgs, SimpleFormData, SimpleFormSchema, SimpleFormReturnArgs } from '../src/topical';
import { TopicWithChild } from '../src/parentTopics';

interface SimpleFormState {
    form: SimpleFormData;
    schema: SimpleFormSchema;
    child: Topic;
}

class SimpleForm extends TopicWithChild<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
    async init (
        context: BotContext,
        args: SimpleFormInitArgs,
    ) {
        this.state.schema = args.schema;
        this.state.form = {}
        await this.doNext(context, this);
    }

    async next (
        context: BotContext,
    ) {
        for (let name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                this.setChild(await new TextPromptTopic()
                    .maxTurns(100)
                    .prompt(context=> {
                        context.reply(metadata.prompt);
                    })
                    .createInstance(
                        context,
                        async (context, result) => {
                            const metadata = this.state.schema[name];

                            if (metadata.type !== 'string')
                                throw `not expecting type "${metadata.type}"`;

                            this.state.form[name] = result.value;
                            this.clearChild();

                            await this.doNext(context, this);
                        }
                    )
                )

                break;
            }
        }

        if (!this.hasChild()) {
            await this.returnToParent(context, {
                form: this.state.form
            });
        }
    }

    async onReceive (
        context: BotContext,
    ) {
        if (!await this.dispatchToChild(context))
            throw "a prompt should always be active"
    }
}

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
    async init(
        c: BotContext,
        args: ShowAlarmInitArgs,
    ) {
        if (args.alarms.length === 0)
            c.reply(`You haven't set any alarms.`);
        else
            c.reply(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

        await this.returnToParent(c);
    }
}

interface DeleteAlarmInitArgs {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    confirm: boolean;
    child: Topic;
}

interface DeleteAlarmReturnArgs {
    alarmName: string;
}

class DeleteAlarm extends TopicWithChild<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs> {
    async init (
        c: BotContext,
        args: DeleteAlarmInitArgs,
    ) {
        if (args.alarms.length === 0) {
            c.reply(`You don't have any alarms.`);
            this.returnToParent(c);
            return;
        }

        this.state.alarms = args.alarms;

        this.setChild(await new TextPromptTopic()
            .maxTurns(100)
            .prompt(context=> {
                context.reply(`Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`);
            })
            .createInstance(c, async (c, args) => {
                this.state.alarmName = args.value;
                this.setChild(await new TextPromptTopic()
                    .maxTurns(100)
                    .prompt(context=> {
                        context.reply(`Are you sure you want to delete alarm "${args.value}"? (yes/no)`);
                    })
                    .createInstance(c, async (c, args) => {
                        this.returnToParent(c, args.value === 'yes'
                            ? {
                                alarmName: this.state.alarmName
                            }
                            : undefined
                        );
                    })
                );
            })
        );
    }

    async onReceive (
        c: BotContext,
    ) {
        await this.dispatchToChild(c);
    }
}

interface AlarmBotState {
    child: Topic;
    alarms: Alarm[];
}

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends TopicWithChild<undefined, AlarmBotState, undefined> {
    async init (
        c: BotContext,
    ) {
        c.reply(`Welcome to Alarm Bot!\n${helpText}`);
        this.state.alarms = [];
    }

    async onReceive (
        c: BotContext,
    ) {
        if (await this.dispatchToChild(c))
            return;

        if (c.request.type === 'message') {
            if (/set|add|create/i.test(c.request.text)) {
                this.setChild(await new SimpleForm().createInstance(
                    c, {
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
                    }, async (c, args) => {
                        this.state.alarms.push({ ... args.form } as any as Alarm);
                        this.clearChild();
                        c.reply(`Alarm successfully added!`);
                    })
                );
            } else if (/show|list/i.test(c.request.text)) {
                this.setChild(await new ShowAlarms().createInstance(
                    c, {
                        alarms: this.state.alarms
                    }, async (c, args) => {
                        this.clearChild();
                    })
                );
            } else if (/delete|remove/i.test(c.request.text)) {
                this.setChild(await new DeleteAlarm().createInstance(
                    c, {
                        alarms: this.state.alarms
                    }, async (c, args) => {
                        if (args) {
                            this.state.alarms = this.state.alarms
                                .filter(alarm => alarm.name !== args.alarmName);
                
                            c.reply(`Alarm "${args.alarmName}" has been deleted.`)
                        } else {
                            c.reply(`Okay, the status quo has been preserved.`)
                        }
                        this.clearChild();
                    })
                );
            } else {
                c.reply(helpText);
            }
        }
    }
}
