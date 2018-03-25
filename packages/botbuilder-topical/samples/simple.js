const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic, TopicWithChild } = require ('../lib/src/topical.js');

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter.listen(async context => {
    await Topic.do(context, () => rootTopic.createInstance(context))
});
        
class ChildTopic extends Topic {
    async init(context, instance, args) {
        await context.sendActivity(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onReceive(context, instance) {
        const text = context.request.type === 'message' ? context.request.text : undefined;
        
        const num = Number.parseInt(text);

        if (Number.isNaN(num))
            context.sendActivity(`Please supply a number.`);
        else
            this.returnToParent(instance, {
                num
            });
    }
}

const childTopic = new ChildTopic();

class RootTopic extends TopicWithChild {
    constructor(name) {
        super(name);

        this
            .onChildReturn(childTopic, async (context, instance, childInstance) => {
                await context.sendActivity(`13 * ${childInstance.returnArgs.num} = ${13 * childInstance.returnArgs.num}`);
                this.clearChild(context, instance);
            });
    }

    async init(context) {
        await context.sendActivity(`Welcome to my root topic!`);
    }
    
    async onReceive(context, instance) {
        const text = context.request.type === 'message' ? context.request.text : undefined;

        if (text === 'end child') {
            if (instance.state.child) {
                this.clearChild(context, instance);
                context.sendActivity(`I have ended the child topic.`);
            } else {
                context.sendActivity(`There is no child to end`);
            }
            return;
        }

        if (await this.dispatchToChild(context, instance))
            return;

        if (text === 'start child') {
            this.setChild(context, instance, await childTopic.createInstance(context, instance, {
                foo: 13
            }));
            return;
        }

        await context.sendActivity(`Try "start child" or "end child".`);
    }
}

const rootTopic = new RootTopic()
