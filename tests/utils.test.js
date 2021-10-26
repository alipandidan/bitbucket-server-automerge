const utils = require('../libs/utils')

describe('utils.hasOne', () => {
    test('if array has one element', () => {
        expect(utils.hasOne(['one'])).toBe(true);
    });

    test('if fails when not one element', () => {
        expect(utils.hasOne(['one', ['two']])).toBe(false);
    });
});