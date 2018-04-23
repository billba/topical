const { MemoryStorage, ConsoleAdapter } = require('botbuilder');
const { Topic, prettyConsole, consoleOnTurn, doTopic } = require ('../lib/src/topical.js');

class ChildTopic extends Topic {

    async onBegin(args) {
        await this.send(`Welcome to the child topic!\nWhat multiple of ${args["foo"]} do you want to return?`);
    }

    async onTurn() {
        const num = Number.parseInt(this.text);

        if (Number.isNaN(num))
            await this.send(`Please supply a number.`);
        else
            return this.returnToParent({
                num
            });
    }
}

class RootTopic extends Topic {

    async onBegin() {
        await this.send(`Welcome to my root topic!`);
    }
    
    async onTurn() {
        if (this.text === 'end child') {
            if (this.hasChildren()) {
                this.clearChildren();
                await this.send(`I have ended the child topic.`);
            } else {
                await this.send(`There is no child to end`);
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

        await this.send(`Try "start child" or "end child".`);
    }

    async onChildReturn(child)
    {
        await this.send(`13 * ${child.return.num} = ${13 * child.return.num}`);
        this.clearChildren();
    }
}
RootTopic.subtopics = [ChildTopic];


Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter()
    .use(prettyConsole);

consoleOnTurn(adapter, context => doTopic(RootTopic, context));
