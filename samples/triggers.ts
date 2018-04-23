import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, consoleOnTurn, doTopic } from '../src/topical';

interface FlightsBegin {
    destination: string;
}

class Flights extends Topic {

    async trigger() {
        if (this.text && this.text.includes('flight'))
            return {
                beginArgs: {
                    destination: 'Paris'
                },
                score: .5
            }
    }

    async onBegin(args?: FlightsBegin) {
        await this.send(`Let's fly to ${ args ? args.destination : 'a city'}!`)
    }

    async onTurn() {
        await this.send(`That's my one trick. Try 'travel' to restart the bot.`);
    }
}

interface HotelsBegin {
    chain: string;
}

class Hotels extends Topic <HotelsBegin> {

    async trigger() {
        if (this.text && this.text.includes('hotel'))
            return {
                beginArgs: {
                    chain: 'Hyatt'
                },
                score: .6
            }
    }

    async onBegin(args?: HotelsBegin) {
        await this.send(`Let's stay at a ${ args ? args.chain : 'hotel'}!`)
    }

    async onTurn() {
        await this.send(`That's my one trick. Try 'travel' to restart the bot.`);
    }
}

class Travel extends Topic  {

    static subtopics = [Flights, Hotels];

    async onBegin() {
        await this.send(`I can book flights and hotels.`);
        this.children = Travel.subtopics.map(T => this.createTopicInstance(T));
        console.log();
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;
        
        if (!await this.tryTriggers())
            await this.send(`I can't do that.`);
    }
}

class Root extends Topic {

    static subtopics = [Travel];

    async onBegin() {
        await this.send(`Say 'travel' to start (or restart) the travel dialog.`);
    }

    async onTurn() {
        if (this.text === 'travel') {
            await this.beginChild(Travel);
            return;
        }

        await this.dispatchToChild();
    }
}

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, context)
);