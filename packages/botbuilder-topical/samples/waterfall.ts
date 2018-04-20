import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall, NumberPrompt, ValidatorResult, CultureConstructor, Prompt, hasNumber, Validator } from '../src/topical';

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async context => {
        await Root.do(context);
    });

class PromptForAge extends Prompt<number, any, CultureConstructor> {

    constructor(construct: CultureConstructor) {
        super(construct);

        this.validator = hasNumber(construct.culture)
            .and((activity, num) => num > 0 && num < 150 || 'invalid_age');
    }

    async prompter(result?: ValidatorResult<number>) {
        await this.context.sendActivity(result
            ? `Please provide a valid age.`
            : `How old are you?`
        );
    }
}

class Age extends Waterfall {

    static subtopics = [PromptForAge];

    waterfall = next => [
        async () => {
            await this.context.sendActivity(`What's your name?`);
        },

        async () => {
            if (this.text === 'Bill Barnes')
                next(51);
            else
                await this.beginChild(PromptForAge, {}, { culture: 'en-us'});
        },

        async (age: number) => {
            await this.context.sendActivity(age > 30
                ? `You're ${age}? That's so old!`
                : `Phew, you've still got a few good years left`
            );
        },
    ];

    // uses default onBegin, onTurn, onChildReturn
}

class Root extends Topic {

    static subtopics = [Age];

    async onBegin() {
        await this.beginChild(Age);
    }

    // uses default onTurn, onChildReturn
}