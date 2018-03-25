import { BotContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, SimpleForm, TextPromptTopic, TopicInstance, TopicWithChild, prettyConsole, WSTelemetry } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

class CustomContext extends BotContext {
    foo: string;

    constructor(context: BotContext) {
        super(context);
        this.foo = "hey";
    }
}

adapter
    .use(prettyConsole)
    .listen(async context => {
        const customContext = new CustomContext(context);
        await Topic.do(customContext, () => foo.createInstance(customContext));
    });


class Child extends Topic<any, any, any, CustomContext> {
    async init(
        context: CustomContext,
        instance: TopicInstance
    ) {
        await context.sendActivity(context.foo);
        this.returnToParent(instance);
    }
}

const child = new Child();

const prompt = new TextPromptTopic<string, CustomContext>()
    .prompter(async (context, instance, args) => {
        await context.sendActivity(context.foo);
        await context.sendActivity(instance.state.promptState);
    });

class Foo extends TopicWithChild<any, any, any, CustomContext> {
    constructor(name?: string) {
        super(name);

        this
            .onChildReturn(child, async (context, instance, childInstance) => {
                await context.sendActivity(context.foo);
                this.setChild(context, instance, await prompt.createInstance(context, instance, {
                    name: 'name',
                    promptState: 'Wassup?',
                }));
            })
            .onChildReturn(prompt, async (context, instance, childInstance) => {
                console.log("I got here");
                await context.sendActivity(`You said ${childInstance.returnArgs.result.value}`);
                this.clearChild(context, instance);
            });
    }

    async init(
        context: CustomContext,
        instance: TopicInstance
    ) {
        this.setChild(context, instance, await child.createInstance(context, instance));
    }

    async onReceive(
        context: CustomContext,
        instance: TopicInstance
    ) {  
        await this.dispatchToChild(context, instance);
    }
}

const foo = new Foo();
