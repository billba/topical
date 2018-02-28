import { TopicClass, StringPrompt } from './topical';

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
    prompt: string;
}

export interface SimpleFormInitArgs {
    schema: SimpleFormSchema
}

export interface SimpleFormReturnArgs {
    form: SimpleFormData;
}

export class SimpleForm extends TopicClass<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
    constructor (
        name: string
    ) {
        super(name);

        const stringPrompt = new StringPrompt(name + ".stringPrompt");

        this
            .init((context, topic) => {
                topic.instance.state.schema = topic.args.schema;
                topic.instance.state.form = {}

                topic.next();
            })
            .next(async (context, topic) => {
                for (let name of Object.keys(topic.instance.state.schema)) {
                    if (!topic.instance.state.form[name]) {
                        const metadata = topic.instance.state.schema[name];

                        if (metadata.type !== 'string')
                            throw `not expecting type "${metadata.type}"`;

                        topic.instance.state.prompt = await topic.createTopicInstance(stringPrompt, {
                            name,
                            prompt: metadata.prompt,
                        });
                        break;
                    }
                }

                if (!topic.instance.state.prompt) {
                    topic.returnToParent({
                        form: topic.instance.state.form
                    });
                }
            })
            .onReceive(async (context, topic) => {
                if (!topic.instance.state.prompt)
                    throw "a prompt should always be active"

                await topic.dispatchToInstance(topic.instance.state.prompt);
            })
            .onChildReturn(stringPrompt, (context, topic) => {
                const metadata = topic.instance.state.schema[topic.args.name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                topic.instance.state.form[topic.args.name] = topic.args.value;
                topic.instance.state.prompt = undefined;

                topic.next();
            });
        }
    }
