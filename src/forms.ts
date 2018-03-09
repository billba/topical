import { TopicClass, TopicInstance, TextPromptTopicClass, TopicClassWithChild } from './topical';

export interface SimpleFormMetadata {
    type: 'string';
    prompt: string;
}

export interface SimpleFormSchema {
    [field: string]: SimpleFormMetadata;
}

export interface SimpleFormData {
    [field: string]: string;
}

export interface SimpleFormState {
    form: SimpleFormData;
    schema: SimpleFormSchema;
    child: string;
}

export interface SimpleFormInitArgs {
    schema: SimpleFormSchema
}

export interface SimpleFormReturnArgs {
    form: SimpleFormData;
}

interface SimpleFormPromptState {
    prompt: string;
}

export class SimpleForm extends TopicClassWithChild<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
    private textPromptClass: TextPromptTopicClass<SimpleFormPromptState>;

    constructor (
        name?: string
    ) {
        super(name);

        this.textPromptClass = new TextPromptTopicClass<SimpleFormPromptState>(this.name)
            .maxTurns(100)
            .prompt(async (context, instance, result) => {
                context.reply(instance.state.promptState.prompt);
            });

        this
            .onChildReturn(this.textPromptClass, async (context, instance, childInstance) => {
                const metadata = instance.state.schema[childInstance.returnArgs.name];
        
                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;
        
                instance.state.form[childInstance.returnArgs.name] = childInstance.returnArgs.result.value;
                instance.state.child = undefined;

                await this.doNext(context, instance.name);
            });
    }

    async init(
        context: BotContext,
        instance: TopicInstance<SimpleFormState, SimpleFormReturnArgs>,
        args: SimpleFormInitArgs
    ) {
        instance.state.schema = args.schema;
        instance.state.form = {};

        await this.doNext(context, instance.name);
    }

    async next(
        context: BotContext,
        instance: TopicInstance<SimpleFormState, SimpleFormReturnArgs>,
    ) {
        for (let name of Object.keys(instance.state.schema)) {
            if (!instance.state.form[name]) {
                const metadata = instance.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                instance.state.child = await this.textPromptClass.createInstance(context, instance, {
                    name,
                    promptState: {
                        prompt: metadata.prompt,
                    },
                });
                break;
            }
        }

        if (!instance.state.child) {
            this.returnToParent(instance, {
                form: instance.state.form
            });
        }
    }

    async onReceive(
        context: BotContext,
        instance: TopicInstance<SimpleFormState, SimpleFormReturnArgs>,
    ) {
        if (!await this.dispatch(context, instance.state.child))
            throw "a prompt should always be active";
    }
}
