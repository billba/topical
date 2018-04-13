const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic, TopicWithChild } = require ('../lib/src/topical.js');

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter.listen(async context => {
    await RootTopic.do(context)
});
        
class ChildTopic extends Topic {
    async init(args) {
        await this.context.sendActivity(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onTurn() {
        const text = this.context.request.type === 'message' ? this.context.request.text : undefined;
        
        const num = Number.parseInt(text);

        if (Number.isNaN(num))
            await this.context.sendActivity(`Please supply a number.`);
        else
            return this.returnToParent({
                num
            });
    }
}

class RootTopic extends TopicWithChild {

    static subtopics = [ChildTopic];

    async init() {
        await this.context.sendActivity(`Welcome to my root topic!`);
    }
    
    async onTurn() {
        const text = this.context.request.type === 'message' ? this.context.request.text : undefined;

        if (text === 'end child') {
            if (this.hasChild()) {
                this.clearChild();
                await this.context.sendActivity(`I have ended the child topic.`);
            } else {
                await this.context.sendActivity(`There is no child to end`);
            }
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (text === 'start child') {
            return this.createChild(ChildTopic, {
                foo: 13
            });
        }

        await this.context.sendActivity(`Try "start child" or "end child".`);
    }

    async onChildReturn(child)
    {
        await this.context.sendActivity(`13 * ${child.returnArgs.num} = ${13 * child.returnArgs.num}`);
        this.clearChild();
    }

}
