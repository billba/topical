import { TopicClass } from './topical';
import { TextPromptTopicClass } from './topicClassPrompts';

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


interface SimpleFormPromptState {
    prompt: string;
}

export class SimpleForm extends TopicClass<SimpleFormInitArgs, SimpleFormState, SimpleFormReturnArgs> {
    constructor (
        name: string
    ) {
        super(name);

        const textPromptClass = new TextPromptTopicClass<SimpleFormPromptState>(name + ".stringPrompt")
            .maxTurns(100)
            .prompt((context, topicContext) => {
                context.reply(topicContext.instance.state.promptState.prompt);
            })

        this
            .init(async (context, topic) => {
                topic.instance.state.schema = topic.args.schema;
                topic.instance.state.form = {}

                await topic.doNext(topic.instance.name);
            })
            .next(async (context, topic) => {
                for (let name of Object.keys(topic.instance.state.schema)) {
                    if (!topic.instance.state.form[name]) {
                        const metadata = topic.instance.state.schema[name];

                        if (metadata.type !== 'string')
                            throw `not expecting type "${metadata.type}"`;

                        topic.instance.state.prompt = await topic.createTopicInstance(textPromptClass, {
                            name,
                            promptState: {
                                prompt: metadata.prompt,
                            },
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
                if (!await topic.dispatch(topic.instance.state.prompt))
                    throw "a prompt should always be active";
            })
            .onChildReturn(textPromptClass, async (context, topic) => {
                const metadata = topic.instance.state.schema[topic.args.name];

                if (metadata.type !== 'string')
                    throw `not expecting type "${metadata.type}"`;

                topic.instance.state.form[topic.args.name] = topic.args.result.value;
                topic.instance.state.prompt = undefined;

                await topic.doNext(topic.instance.name);
            });
        }
    }
