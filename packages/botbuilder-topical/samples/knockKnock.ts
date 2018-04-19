import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall } from '../src/topical';

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async context => {
        await Root.do(context);
    });

class KnockKnock extends Waterfall {

    async onBegin() {

        await this.onTurn();
    }

    async onTurn() {

        if (await this.waterfall(

            async () => {
                await this.context.sendActivity(`Who's there?`);
            },
            async () => {
                if (this.text === 'cheat')
                    return true;

                await this.context.sendActivity(`${this.text} who?`);
            },
            async () => {
                await this.context.sendActivity(`Hilarious!`);
            },
        ))
            this.returnToParent();
    }
}

class Root extends Topic {

    static subtopics = [KnockKnock];

    async onBegin() {

        await this.context.sendActivity(`Tell me a knock knock joke`);
    }

    async onTurn() {

        if (this.text === 'knock knock') {
            await this.beginChild(KnockKnock);
            return;
        }

        if (await this.dispatchToChild())
            return;
    }

    async onChildReturn(child: KnockKnock) {

        this.clearChildren();

        await this.context.sendActivity(`That was fun. Tell me another.`);
    }
}