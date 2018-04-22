import { Topic, TextPrompt, ValidatorResult } from '../src/topical';

export interface SimpleFormMetadata {
    type: string;
    prompt: string;
}

export type SimpleFormSchema = Record<string, SimpleFormMetadata>;

export type SimpleFormData = Record<string, string>;

export interface SimpleFormState {
    form: SimpleFormData;
    schema: SimpleFormSchema;
}

export interface SimpleFormReturn {
    form: SimpleFormData;
}

export interface PromptForValueArgs {
    name: string;
    prompt: string;
}

export class PromptForValue extends TextPrompt<PromptForValueArgs> {

    maxTurns = Number.MAX_SAFE_INTEGER;

    async prompter(result: ValidatorResult<string>) {
        await this.context.sendActivity(this.state.args!.prompt);
    }
}

export class SimpleForm extends Topic<SimpleFormSchema, SimpleFormState, SimpleFormReturn> {
    
    static subtopics = [PromptForValue];

    async onBegin(
        args?: SimpleFormSchema,
    ) {
        this.state.schema = args!;
        this.state.form = {};

        await this.next();
    }

    async next () {
        for (const name of Object.keys(this.state.schema)) {
            if (!this.state.form[name]) {
                const metadata = this.state.schema[name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                await this.beginChild(PromptForValue, {
                    name,
                    prompt: metadata.prompt,
                });
                break;
            }
        }

        if (!this.hasChildren()) {
            this.returnToParent({
                form: this.state.form
            });
        }
    }

    async onTurn() {
        if (!await this.dispatchToChild())
            throw "a prompt should always be active";
    }

    async onChildReturn(
        child: PromptForValue,
    ) {

        const metadata = this.state.schema[child.return!.args!.name];

        if (metadata.type !== 'string')
            throw `not expecting type "${metadata.type}"`;

        this.state.form[child.return!.args!.name] = child.return!.result.value!;
        this.clearChildren();

        await this.next();
    }
}
