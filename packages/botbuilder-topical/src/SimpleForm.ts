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

    maxTurns = Number.MAX_SAFE_INTEGER;

    async prompter(result: ValidatorResult<string>) {
        await this.context.sendActivity(this.state.args.prompt);
    }
}

export class SimpleForm extends TopicWithChild<SimpleFormInit, SimpleFormState, SimpleFormReturn> {
    
    static subtopics = [PromptForValue];

    async onBegin(
        args: SimpleFormInit,
    ) {
        this.state.schema = args.schema;
        this.state.form = {};

        await this.next();
    }

    async next () {
        for (const name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                await this.createChild(PromptForValue, {
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

    async onTurn() {
        if (!await this.dispatchToChild())
            throw "a prompt should always be active";
    }

    async onChildReturn(child: PromptForValue) {
        const metadata = this.state.schema[child.return.name];

        if (metadata.type !== 'string')
            throw `not expecting type "${metadata.type}"`;

        this.state.form[child.return.name] = child.return.result.value!;
        this.clearChild();

        await this.next();
    }
}
