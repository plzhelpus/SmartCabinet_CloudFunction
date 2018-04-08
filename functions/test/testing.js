var myFunctions = require('../index');

const fakeEvent = {
    data : new functions.database.DeltaSnapshot(nul, nul, nul, 'input'),
};

myFunctions.deleteMemberInGroup(fakeEvent);

return assert.eventually.equal(myFunctions.getOwningGroup(fakeEvent), expectedVal);