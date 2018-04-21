const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic } = require ('../lib/src/topical.js');

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter.listen(async context => {
    await RootTopic.do(context)
});
        
class ChildTopic extends Topic {

    async onBegin(args) {
        await this.context.sendActivity(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onTurn() {
        const num = Number.parseInt(this.text);

        if (Number.isNaN(num))
            await this.context.sendActivity(`Please supply a number.`);
        else
            return this.returnToParent({
                num
            });
    }
}

class RootTopic extends Topic {

    async onBegin() {
        await this.context.sendActivity(`Welcome to my root topic!`);
    }
    
    async onTurn() {
        if (this.text === 'end child') {
            if (this.hasChildren()) {
                this.clearChildren();
                await this.context.sendActivity(`I have ended the child topic.`);
            } else {
                await this.context.sendActivity(`There is no child to end`);
            }
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === 'start child') {
            return this.beginChild(ChildTopic, {
                foo: 13
            });
        }

        await this.context.sendActivity(`Try "start child" or "end child".`);
    }

    async onChildReturn(child)
    {
        await this.context.sendActivity(`13 * ${child.return.num} = ${13 * child.return.num}`);
        this.clearChildren();
    }

}

RootTopic.subtopics = [ChildTopic];