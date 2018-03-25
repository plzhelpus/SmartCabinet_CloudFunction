import * as cloudfunctions from 'firebase-functions';

const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// exports.addMessage = functions.https.onRequest((req, res) => {
//     const original = req.query.text;
//     return admin.database().ref('/messages').push({original: original}).then((snapshot) => {
//         return res.redirect(303, snapshot.ref);
//     });
// });
//
// exports.makeUppercase = functions.database.ref('/messages/{pushID}/original').onWrite((event) => {
//     const original = event.data.val();
//     console.log('Uppercasing', event.params.pushID, original);
//     const uppercase = original.toUpperCase();
//     return event.data.ref.parent.child('uppercase').set(uppercase);
// });

exports.getOwningGroup = functions.firestore
    .document('cabinets/{groupID}')
    .onUpdate(event => {
        const groupID = event.data.data();
        return groupID;
    });

/*exports.getParticipatedGroupList = functions.firestore
    .document('users/{userID}/participated_group')
    .onUpdate(event => {
        const groupIDList = event.data.data();
        return groupIDList;
    });*/

exports.getParticipatedGroup = functions.firestore
    .document('users/{userID}/participated_group/{group_ID}')
    .onUpdate(event => {
        const group = event.data.data();
        return group;
    });

exports.getGroupInfo = functions.firestore
    .document('groups/{groupID}')
    .onUpdate(event => {
        const group = event.data.data();
        return group;
    });

/*exports.getGroupAdminList = functions.firestore
    .document('user/{groupID}/admin_ref')
    .onUpdate(event => {
        const adminList = event.data.data();
        return adminList;
    });*/

exports.getGroupAdmin = functions.firestore
    .document('user/{groupID}/admin_ref/{adminID}')
    .onUpdate(event => {
        const _admin = event.data.data();
        return _admin;
    });

/*exports.getGroupMemberlist = functions.firestore
    .document('user/{groupID}/member_ref')
    .onUpdate(event => {
        const memberList = event.data.data();
        return memberList;
    });*/

exports.getGroupMember = functions.firestore
    .document('user/{groupID}/member_ref/{memberID}')
    .onUpdate(event => {
        const member = event.data.data();
        return member;
    });

/*exports.getGroupCabinetList = functions.firestore
    .document('user/{groupID}/cabinet_ref')
    .onUpdate(event => {
        const cabinetList = event.data.data();
        return cabinetList;
    });*/

exports.getGroupCabinet = functions.firestore
    .document('user/{groupID}/cabinet_ref/{cabinetID}')
    .onUpdate(event => {
        const cabinet = event.data.data();
        return cabinet;
    });
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
