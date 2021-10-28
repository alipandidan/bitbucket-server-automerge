const httpStatus = require('../libs/http-status')

describe('http-status.isFailed', () => {
    test('if 4xx http code is considered error', () => {
        expect(httpStatus.isFailed({status: 404})).toBe(true);
    });

    test('if 2xx http code not considered ok', () => {
        expect(httpStatus.isFailed({status: 201})).toBe(false)
    })
});

describe('http-status.isSuccessful', () => {
    test('if 2xx http code is considered ok', () => {
        expect(httpStatus.isSuccessful({status: 201})).toBe(true);
    });

    test('if 4xx http code not considered ok', () => {
        expect(httpStatus.isSuccessful({status: 404})).toBe(false)
    })
});
