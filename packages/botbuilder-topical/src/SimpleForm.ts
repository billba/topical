import { Topic, TextPrompt, TopicWithChild, ValidatorResult } from './topical';
import { BotContext } from 'botbuilder';

export interface SimpleFormMetadata {
    type: string;
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

export interface SimpleFormInit {
    schema: SimpleFormSchema
}

export interface SimpleFormReturn {
    form: SimpleFormData;
}

interface SimpleFormPromptState {
    prompt: string;
}

class PromptForValue extends TextPrompt<SimpleFormPromptState> {

    maxTurns = 100;

    async prompter(result: ValidatorResult<string>) {
        await this.context.sendActivity(this.state.args.prompt);
    }
}

export class SimpleForm extends TopicWithChild<SimpleFormInit, SimpleFormState, SimpleFormReturn> {

    async init(
        args: SimpleFormInit,
    ) {
        this.state.schema = args.schema;
        this.state.form = {};

        await this.next();
    }

    async next () {
        for (let name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                this.createChild(PromptForValue, {
                    name,
                    args: {
                        prompt: metadata.prompt,
                    },
                });
                break;
            }
        }

        if (!this.hasChild()) {
            this.returnToParent({
                form: this.state.form
            });
        }
    }

    async onReceive() {
        if (!await this.dispatchToChild())
            throw "a prompt should always be active";
    }

    async onChildReturn(child: Topic) {
        if (child instanceof PromptForValue) {
            const metadata = this.state.schema[child.returnArgs.name];

            if (metadata.type !== 'string')
                throw `not expecting type "${metadata.type}"`;

            this.state.form[child.returnArgs.name] = child.returnArgs.result.value!;
            this.clearChild();

            await this.next();
        }
    }
}
