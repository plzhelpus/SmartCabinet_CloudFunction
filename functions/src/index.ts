import * as cloudfunctions from 'firebase-functions';
import {user} from "firebase-functions/lib/providers/auth";

const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

const db = admin.firestore();
// const batch = db.batch();

exports.createUser = functions.auth.user().onCreate((userRecord, context) => {
    //Create users/userID
    db.collection('users').doc(userRecord.uid).set({
        email : userRecord.email
    });
    // db.collection('users').doc(userRecord.uid).collection('participated_group').set({});
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

    // db.collection('users').doc(userRecord.uid).collection('participated_group').delete();

    //삭제 안되는 중. collection에 삭제 없나?
    db.collection('users').doc(userRecord.uid).delete();
    return deleteCollection('users/' + userRecord.uid + '/participated_group/', 100);
    //컬렉션 삭제 해야 함
});

exports.deleteMemberInGroup = functions.firestore
    .document('users/{userID}/participated_group/{groupID}')
    .onDelete((snap, context) => {
        //group 안의 member에서 해당 유저 삭제
        db.collection('groups').doc(context.params.groupID).collection('member_ref').doc(context.params.userID).delete();
        // db.collection('groups/' + context.params.groupID + '/member_ref').doc(context.params.userID).delete();
    });

exports.addCabinetToGroup = functions.firestore
    .document('cabinets/{cabinetID}/group_ref/{groupID}')
    .onCreate((snap, context) => {
        //cabinet가 가진 group_refo의 cabinet_refo에 해당 cabinet 추가
        db.collection('groups').doc(context.params.grouID).collection('cabinet_ref').doc(context.params.cabinetID).set({
            cabinet_ref : context.param.cabinetID
        });
    });

exports.deleteGroupInOwner = functions.firestore
    .document('cabinets/{groupID}')
    .onDelete((snap, context) => {
        //owner_ref의 participated_group에서 해당 group 삭제
        db.collection('users').doc(snap.data().owner_ref).collection('participated_group').doc(context.params.group).delete();
    });

exports.deleteGroupInAdmin = functions.firestore
    .document('groups/{groupID}/admin_ref/{adminID}')
    .onDelete((snap, context) => {
        //adminID의 participated_group에서 해당 group 삭제
        db.collection('users').doc(context.params.adminID).collection('participated_group').doc(context.params.groupId).delete();
    });

exports.moveMemberToAdmin = functions.firestore
    .document('groups/{groupID}/admin_ref/{adminID}')
    .onCreate((snap, context) => {
        db.collection('groups').doc(context.params.groupID).collection('admin_ref').doc(context.params.adminID).delete();
    });

exports.deleteGroupInMember = functions.firestore
    .document('groups/{groupID}/member_ref/{memberID}')
    .onDelete((snap, context) => {
        //삭제된 user의 participated_group에서 해당 그룹 삭제
        db.collection('users').doc(context.params.memberID).collection('participated_group').doc(context.params.groupId).delete();
    });

exports.deleteCabinet = functions.firestore
    .document('groups/{groupID}/cabinet_ref/{cabinetID}')
    .onDelete((snap, context) => {
        //cabinet_ref에 속한 cabinet의 group_ref에서 해당 group 삭제
        db.collection('cabinets').doc(context.params.cabinetID).delete();
    });

exports.addGroupToMember = functions.firestore
    .document('groups/{groupID}/member_ref/{memberID}')
    .onCreate((snap, context) => {
        //group에 초대한 user의 participated_ref에 해당 group 추가
        db.collection('users').doc(context.params.memberID).collection('participated_group').doc(context.params.groupID).set({
            group_ref : context.params.groupID
        });
    });

exports.deleteMemberInGroup = functions.firestore
    .document('user/{userID}/participated_group/{group_ID}')
    .onDelete((snap, context) => {
        //user 탈퇴한 group의 member_ref에서 해당 user 삭제
        db.collection('groups').doc(context.params.groupID).collection('member_ref').doc(context.params.userID).delete();
    });

exports.updateAdmin = functions.firestore
    .document('groups/{groupID}')
    .onUpdate((change, context) => {
        //Owner로 올라갔을 경우 기존 Owner를 Admin으로 변경
        const nowData = change.after.data();
        const nowOwner = nowData.split('/users/')[1];
        const beforeData = change.before.data();
        const beforeOwner = beforeData.split('/users/')[1];
        db.collection('groups').doc(context.params.groupID).collection('admin_ref').doc(nowOwner).delete();
        db.collection('groups').doc(context.params.groupID).collection('member_ref').doc(nowOwner).delete();
        db.collection('groups').doc(context.params.groupID).collection('admin_ref').doc(beforeOwner).set({
            user_ref : beforeData
        });
    });