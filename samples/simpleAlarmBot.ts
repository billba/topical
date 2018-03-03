import { ConsoleAdapter } from 'botbuilder-node';
import { Bot } from 'botbuilder';
import { Topic, prettyConsole } from '../src/topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(prettyConsole)
    .onReceive(async c => {
        await Topic.do(c, () => new AlarmBot().createTopicInstance(c))
    });


import { SimpleFormInitArgs, SimpleFormData, SimpleFormSchema, SimpleFormReturnArgs } from '../src/topical';

interface PromptState {
    prompt: string;
}

interface PromptReturnArgs {
    value: string;
}

class StringPrompt extends Topic<PromptState, PromptState, PromptReturnArgs> {
    constructor () {
        super(async (context, args) => {
            context.reply(args.prompt);
        });
    }

    async onReceive (
        context: BotContext,
    ) {
        await this.returnToParent(context, {
            value: context.request.text
        });
    }
}

interface SimpleFormState {
    form: SimpleFormData;
    schema: SimpleFormSchema;
    prompt: Topic;
}

class SimpleForm extends Topic<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
    constructor () {
        super(async (context, args) => {
            this.state.schema = args.schema;
            this.state.form = {}
            await this.next(context);
        });
    }

    async next (
        context: BotContext,
    ) {
        for (let name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                this.state.prompt = await new StringPrompt().createTopicInstance(
                    context, {
                        prompt: metadata.prompt,
                    }, async (context, args) => {
                        const metadata = this.state.schema[name];

                        if (metadata.type !== 'string')
                            throw `not expecting type "${metadata.type}"`;

                        this.state.form[name] = args.value;
                        this.state.prompt = undefined;

                        await this.next(context);
                    });

                break;
            }
        }

        if (!this.state.prompt) {
            await this.returnToParent(context, {
                form: this.state.form
            });
        }
    }

    async onReceive (
        context: BotContext,
    ) {
        if (!await this.dispatch(context, this.state.prompt))
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
    constructor () {
        super(async (c, args) => {
            if (args.alarms.length === 0)
                c.reply(`You haven't set any alarms.`);
            else
                c.reply(`You have the following alarms set:\n${listAlarms(args.alarms)}`);

            await this.returnToParent(c);
        });
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

class DeleteAlarm extends Topic<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmReturnArgs> {
    constructor () {
        super(async (c, args) => {
            if (args.alarms.length === 0) {
                c.reply(`You don't have any alarms.`);
                this.returnToParent(c);
                return;
            }

            this.state.alarms = args.alarms;

            this.state.child = await new StringPrompt().createTopicInstance(
                c, {
                    prompt: `Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`,
                }, async (c, args) => {
                    this.state.alarmName = args.value;
                    this.state.child = await new StringPrompt().createTopicInstance(
                        c, {
                            prompt: `Are you sure you want to delete alarm "${args.value}"? (yes/no)"`,
                        }, async (c, args) => {
                            this.returnToParent(c, args.value === 'yes'
                                ? {
                                    alarmName: this.state.alarmName
                                }
                                : undefined
                            );
                    });
                });
        });
    }

    async onReceive (
        c: BotContext,
    ) {
        await this.dispatch(c, this.state.child);
    }
}

interface AlarmBotState {
    child: Topic;
    alarms: Alarm[];
}

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends Topic<undefined, AlarmBotState, undefined> {
    constructor () {
        super(async (c, args) => {
            c.reply(`Welcome to Alarm Bot!\n${helpText}`);
            this.state.alarms = [];
        });
    }

    async onReceive (
        c: BotContext,
    ) {
        if (await this.dispatch(c, this.state.child))
            return;

        if (c.request.type === 'message') {
            if (/set|add|create/i.test(c.request.text)) {
                this.state.child = await new SimpleForm().createTopicInstance(
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
                        this.state.child = undefined;
                        c.reply(`Alarm successfully added!`);
                    });
            } else if (/show|list/i.test(c.request.text)) {
                this.state.child = await new ShowAlarms().createTopicInstance(
                    c, {
                        alarms: this.state.alarms
                    }, async (c, args) => {
                        this.state.child = undefined;
                    });
            } else if (/delete|remove/i.test(c.request.text)) {
                this.state.child = await new DeleteAlarm().createTopicInstance(
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
                        this.state.child = undefined;
                    });
            } else {
                c.reply(helpText);
            }
        }
    }
}
