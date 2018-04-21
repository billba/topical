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
        await this.context.sendActivity(`Let's fly to ${ args ? args.destination : 'a city'}!`)
    }

    async onTurn() {
        if (this.text === 'restart') {
            this.begun = false;
            return;
        }

        await this.context.sendActivity(`I don't really do much. Try "restart".`);
    }
}

interface HotelsBegin {
    chain: string;
}

class Hotels extends Topic <HotelsBegin> {

    async onBegin(args?: HotelsBegin) {
        await this.context.sendActivity(`Let's stay at a ${ args ? args.chain : 'hotel'}!`)
    }

    async trigger() {
        if (this.text && this.text.includes('hotel'))
            return {
                beginArgs: {
                    chain: 'Hyatt'
                },
                score: .6
            }
    }

    async onTurn() {
        if (this.text === 'restart') {
            this.begun = false;
            return;
        }

        await this.context.sendActivity(`I don't really do much. Try "restart".`);
    }
}

class Travel extends Topic  {

    static subtopics = [Flights, Hotels];

    async onBegin() {
        await this.context.sendActivity(`I can book flights and hotels.`);
        this.children = Travel.subtopics.map(T => this.createTopicInstance(T));
        console.log();
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;
        
        if (!await this.tryTriggers())
            await this.context.sendActivity(`I can't do that.`);
    }
}

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Travel, context)
);