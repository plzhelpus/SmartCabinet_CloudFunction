import * as cloudfunctions from 'firebase-functions';
import {user} from "firebase-functions/lib/providers/auth";

const admin = require('firebase-admin');
const functions = require('firebase-functions');
admin.initializeApp();

const db = admin.firestore();
// const batch = db.batch();

exports.createUser = functions.auth.user().onCreate((userRecord, context) => {
    //Create users/userID
    return db.collection('users').doc(userRecord.uid).set({
        email : userRecord.email
    }).then(() => {
        console.log('User firebase is added at ${res.updateTime}')
    });
});

function deleteCollection(collectionPath, batchSize){
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, batchSize, resolve, reject);
    });
}

function deleteQueryBatch(query, batchSize, resolve, reject){
    query.get().then((snapshot)=>{
        if(snapshot.size === 0){
            return 0;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc)=>{
            batch.delete(doc.ref);
        });

        return batch.commit().then(()=>{
            return snapshot.size;
        });
    }).then((numDeleted)=>{
        if(numDeleted === 0){
            resolve();
            return;
        }
        process.nextTick(()=>{
            deleteQueryBatch(query, batchSize, resolve, reject);
        });
    }).catch(reject);
}

exports.deleteUser = functions.auth.user().onDelete((userRecord, context)=> {
   //delete users/userID
    db.collection('users').doc(userRecord.uid).delete().then(() => {
        return deleteCollection('users/' + userRecord.uid + '/participated_group/', 100);
    });
    // return deleteCollection('users/' + userRecord.uid + '/participated_group/', 100);
});

exports.deleteAllFromGroup = functions.firestore
    .document('groups/{groupID}')
    .onDelete((snap, context) => {
        // return deleteCollection('users/' + context.params.groupID + '/admin_ref', 100)
        //     .then(exports.deleteParticipatedGroupInOwner)
        //     .then(exports.dleeteGroupInCabinet)
        //     .then(exports.deleteGroupInAdmin)
        //     .then(exports.deleteGroupInMember)

        //TODO: delete All lower collections in this document.
    });

exports.deleteParticipatedGroupInOwner = functions.firestore
    .document('groups/{groupID}')
    .onDelete((snap, context) => {
        //owner_ref의 participated_group에서 해당 group 삭제
        return db.collection('users').doc(snap.data().owner_ref).collection('participated_group').doc(context.params.groupID).delete().then(() => {
            console.log('Participated Group is deleted from Owner');
        });
    });

exports.deleteGroupInCabinet = functions.firestore
    .document('groups/{groupID}/cabinet_ref/{cabinetID}')
    .onDelete((snap, context) => {
        //cabinet_ref에 속한 cabinet의 group_ref에서 해당 group 삭제
        return db.collection('cabinets').doc(context.params.cabinetID).update({
            "group_ref" : null
        }).then(res => {
            console.log('Group is deleted from cabinet at ${res.updateTime}');
        });
    });
//
// exports.deleteGroupInAdmin = functions.firestore
//     .document('groups/{groupID}/admin_ref/{adminID}')
//     .onDelete((snap, context) => {
//         return db.collection('users').doc(context.param.adminID).collection('participated_group').doc(context.prams.groupID).delete().then(() => {
//             console.log('Participated Group is deleted from Admin');
//         })
//     })
//
// exports.deleteGroupInMember = functions.firestore
//     .document('groups/{groupId}/member_ref/{memberID}')
//     .onDelete((snap, context) => {
//         return db.collection('users').doc(context.param.memberID).collection('participated_group').doc(context.prams.groupID).delete().then(() => {
//             console.log('Participated Group is deleted from Member');
//         })
//     })

exports.addParticipatedGroupToMember = functions.firestore
    .document('groups/{groupID}/member_ref/{memberID}')
    .onCreate((snap, context) => {
        //group에 초대한 user의 participated_ref에 해당 group 추가
        const group_name = db.collection('groups').doc(context.params.groupID).get('group_name');
        return db.collection('users').doc(context.params.memberID).collection('participated_group').doc(context.params.groupID).set({
            group_name : group_name,
            group_ref : context.params.groupID
        }).then(res => {
            console.log('Group is added to Member\'s ParticipatedGroup at ${res.updateTime}');
        });
    });


// exports.addCabinetToGroup = functions.https.onCall((data, context) => {
//     //cabinet가 가진 group_refo의 cabinet_refo에 해당 cabinet 추가
//     return db.collection('groups').doc(context.params.grouID).collection('cabinet_ref').doc(context.params.cabinetID).set({
//         cabinet_ref : context.param.cabinetID,
//         description : '',
//         serial_key : ''
//     }).then(() => {
//         console.log('add cabinet to specific group');
//         return {cabinet_ref : context.param.cabinID};
//     });
// });
