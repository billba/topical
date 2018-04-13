import { Activity } from 'botbuilder';
import { Validator } from './Validator';

export const isMessage = new Validator<Partial<Activity>>(activity => activity.type === 'message'
    ? { value: activity }
    : { reason: 'not_a_message' }
);

export const hasText = isMessage
    .and((activity, value) => {
        const text = value.text.trim();

        return text.length
            ? { value: text }
            : { reason: 'empty_text' }
    });

import { NumberRecognizer } from '@microsoft/recognizers-text-number';

export const hasNumbers = (culture: string) => hasText
    .and(async (activity, text) => {
        const numbers = new NumberRecognizer(culture)
            .getNumberModel()
            .parse(text)
            .map(modelResult => modelResult.resolution)
            .filter(resolution => resolution !== undefined)
            .map(resolution => parseFloat(resolution.value));

        return numbers.length > 0
            ? { value: numbers }
            : { reason: 'not_a_number' }
    });

export const hasNumber = (culture: string) => hasNumbers(culture)
    .and(async (activity, numbers) => ({ value: numbers[0] }));

export { Culture } from '@microsoft/recognizers-text-number';
