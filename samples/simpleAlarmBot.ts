import { ConsoleAdapter } from 'botbuilder-node';
import { Bot } from 'botbuilder';
import { Topic, prettyConsole } from '../src/topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(prettyConsole)
    .onReceive(async c => {
        await Topic.do(c, async () => {
            const alarmBot = new AlarmBot();
            await alarmBot.init(c);
            return alarmBot;
        });
    });


import { SimpleFormInitArgs, SimpleFormData, SimpleFormSchema, SimpleFormReturnArgs } from '../src/topical';

interface PromptState {
    prompt: string;
}

interface PromptReturnArgs {
    value: string;
}

class StringPrompt extends Topic<PromptState> {
    constructor(
        protected returnToParent: (context: BotContext, args: PromptReturnArgs) => Promise<void>
    ) {
        super(returnToParent);
    }

    async init(
        context: BotContext,
        args: PromptState,
    ) {
        context.reply(args.prompt);
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

class SimpleForm extends Topic<SimpleFormState> {
    constructor (
        returnToParent: (context: BotContext, args: SimpleFormReturnArgs) => Promise<void>
    ) {
        super(returnToParent);
    }

    async init(
        context: BotContext,
        args: SimpleFormInitArgs,
    ) {
        this.state.schema = args.schema;
        this.state.form = {}
        await this.next(context);
    }

    async next (
        context: BotContext,
    ) {
        for (let name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                this.state.prompt = await new StringPrompt (async (context, args) => {
                    const metadata = this.state.schema[name];

                    if (metadata.type !== 'string')
                        throw `not expecting type "${metadata.type}"`;

                    this.state.form[name] = args.value;
                    this.state.prompt = undefined;

                    await this.next(context);
                });

                await this.state.prompt.init(context, {
                    prompt: metadata.prompt,
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
        if (!this.state.prompt)
            throw "a prompt should always be active"

        await this.state.prompt.onReceive(context);
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

class ShowAlarms extends Topic {
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

class DeleteAlarm extends Topic<DeleteAlarmState> {
    constructor(
        protected returnToParent: (c: BotContext, args?: DeleteAlarmReturnArgs) => Promise<void>
    ) {
        super(returnToParent);
    }

    async init(
        c: BotContext,
        args: DeleteAlarmInitArgs,
    ) {
        if (args.alarms.length === 0) {
            c.reply(`You don't have any alarms.`);
            this.returnToParent(c);
            return;
        }

        this.state.alarms = args.alarms;

        this.state.child = await new StringPrompt(async (c, args) => {
            this.state.alarmName = args.value;
            this.state.child = await new StringPrompt(async (c, args) => {
                this.returnToParent(c, args.value === 'yes'
                    ? {
                        alarmName: this.state.alarmName
                    }
                    : undefined
                )
            });
        
            await this.state.child.init(c, {
                prompt: `Are you sure you want to delete alarm "${args.value}"? (yes/no)"`,
            });
        });

        await this.state.child.init(c, {
            prompt: `Which alarm do you want to delete?\n${listAlarms(this.state.alarms)}`,
        });
    }

    async onReceive (
        c: BotContext,
    ) {
        if (this.state.child)
            await this.state.child.onReceive(c);
    }
}

interface AlarmBotState {
    child: Topic;
    alarms: Alarm[];
}

const helpText = `I know how to set, show, and delete alarms.`;

class AlarmBot extends Topic<AlarmBotState> {
    constructor(
    ) {
        super();
    }

    async init(
        c: BotContext,
        args?: any,
    ) {
        c.reply(`Welcome to Alarm Bot!\n${helpText}`);
        this.state.alarms = [];
    }

    async onReceive (
        c: BotContext,
    ) {
        if (this.state.child)
            return this.state.child.onReceive(c);

        if (c.request.type === 'message') {
            if (/set|add|create/i.test(c.request.text)) {
                this.state.child = await new SimpleForm(async (c, args) => {
                    this.state.alarms.push({ ... args.form } as any as Alarm);
                    this.state.child = undefined;
                    c.reply(`Alarm successfully added!`);
                });

                await this.state.child.init(c, {
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
                this.state.child = await new ShowAlarms(async (c, args) => {
                    this.state.child = undefined;
                });

                await this.state.child.init(c, {
                    alarms: this.state.alarms
                });
            } else if (/delete|remove/i.test(c.request.text)) {
                this.state.child = await new DeleteAlarm(async (c, args) => {
                    if (args) {
                        this.state.alarms = this.state.alarms
                            .filter(alarm => alarm.name !== args.alarmName);
            
                        c.reply(`Alarm "${args.alarmName}" has been deleted.`)
                    } else {
                        c.reply(`Okay, the status quo has been preserved.`)
                    }
                    this.state.child = undefined;
                });

                await this.state.child.init(c, {
                    alarms: this.state.alarms
                });
            } else {
                c.reply(helpText);
            }
        }
    }
}
