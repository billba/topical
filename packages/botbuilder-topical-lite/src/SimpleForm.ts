import { Topic, TopicWithChild, TextPrompt } from './topical';

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

export interface SimpleFormInitArgs {
    schema: SimpleFormSchema
}

export interface SimpleFormReturnArgs {
    form: SimpleFormData;
}

export interface SimpleFormPromptState {
    prompt: string;
}

export interface SimpleFormState {
    form: SimpleFormData;
    schema: SimpleFormSchema;
    child: Topic;
}

export class SimpleForm extends TopicWithChild<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
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

                this.setChild(await new TextPrompt()
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
