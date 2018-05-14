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

function deleteCollection_nested(collectionPath, batchSize){
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatchAndDocs(query, batchSize, resolve, reject);
    });
}

function deleteQueryBatch(query, batchSize, resolve, reject){
    query.get().then((snapshot)=>{
        if(snapshot.size === 0){
            return new Promise(function(){
                console.log('All documents deleted.');
            });
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

function deleteQueryBatchAndDocs(query, batchSize, resolve, reject){
    query.get().then((snapshot)=>{
        if(snapshot.size === 0){
            return new Promise(function(){
                console.log('All documents deleted.');
            });
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc)=>{
            const group_id = doc.ref.parent.parent.id;
            batch.delete(doc.get('user_ref').collection('participated_group').doc(group_id));
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
});

exports.deleteAllFromGroup = functions.firestore
    .document('groups/{groupID}')
    .onDelete((snap, context) => {
        return Promise.all([db.doc(snap.owner_ref).collection('participated_group').doc(context.params.groupID).delete(),
                                    deleteCollection_nested('groups/' + context.params.groupID + '/admin_ref/', 100),
                                    deleteCollection_nested('groups/' + context.params.groupID + '/member_ref/', 100),
                                    deleteCollection('groups/' + context.params.groupID + '/cabinet_ref/', 100)]).then(function(){
                                        console.log('delete all lower documents and nested information.');
        });
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
        //cabinet_ref에 속한 cabinet의 group_ref에서 그룹 정보 초기화
        return db.collection('cabinets').doc(context.params.cabinetID).update({
            "group_ref" : null
        }).then(res => {
            console.log('Group is deleted from cabinet at ${res.updateTime}');
        });
    });

exports.addMemberToGroup = functions.https.onCall((data, context) => {
   return db.collection('groups').doc(data.groupID).collection('member_ref').doc(context.auth.uid).set({
       "email" : context.auth.token.email,
       "user_ref" : context.params.id
   }).then(() => {
       db.collection('users').doc(context.params.id).collection('participated_group').doc(data.groupID).set({
           "group_name" : data.groupName,
           "group_ref" : data.groupID
       }).then(() => {
           console.log('Add user as member in group and group as participated_group in user');
       });
   });
   //TODO : error 뱉기
});

exports.addCabinetToGroup = functions.https.onCall((data, context) => {
    //cabinet가 가진 group_refo의 cabinet_refo에 해당 cabinet 추가
    return db.collection('groups').doc(data.groupID).collection('cabinet_ref').doc(data.cabinetID).set({
        cabinet_ref : data.cabinetID,
        description : ''
    }).then(() => {
        console.log('add cabinet to specific group');
        return {cabinet_ref : data.cabintID};
    });
});
