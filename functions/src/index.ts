import * as cloudfunctions from 'firebase-functions';

const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

exports.deleteMemberInGroup = functions.firestore
    .document('users/{userID}/participated_group/{groupID}')
    .onDelete(event => {
        //group 안의 member에서 해당 유저 삭제
        db.collection('groups/' + event.params.groupID + '/member_ref').doc(event.params.userID).delete();
    });

exports.addCabinetToGroup = functions.firestore
    .document('cabinets/{cabinetID}/group_ref/{groupID}')
    .onCreate(event => {
        //cabinet가 가진 group_refo의 cabinet_refo에 해당 cabinet 추가
        db.collection('groups/' + event.params.groupID + '/cabinet_ref').doc(event.praram.cabinetID).set({
            cabinet_ref : event.param.cabinetID
        });
    });

exports.deleteGroupInOwner = functions.firestore
    .document('cabinets/{groupID}')
    .onDelete(event => {
        //owner_ref의 participated_group에서 해당 group 삭제
        db.collection('users/' + event.data.data().owner_ref + '/participated_group/').doc(event.params.groupID).delete();
    });

exports.deleteGroupInAdmin = functions.firestore
    .document('cabinets/{groupID}/admin_ref/{adminID}')
    .onDelete(event => {
        //adminID의 participated_group에서 해당 group 삭제
        db.collection('users/' + event.params.adminID + '/participated_group/').doc(event.params.groupID).delete();
    });

exports.deleteGroupInMember = functions.firestore
    .document('groups/{groupID}/member_ref/{memberID}')
    .onDelete(event => {
        //삭제된 user의 participated_group에서 해당 그룹 삭제
        db.collection('users/' + event.params.memberID + '/participated_group').doc(event.params.groupID).delete();
    });

exports.deleteCabinet = functions.firestore
    .document('groups/{groupID}/cabinet_ref/{cabinetID}')
    .onDelete(event => {
        //cabinet_ref에 속한 cabinet의 group_ref에서 해당 group 삭제
        db.collection('cabinets').doc(event.params.cabinetID).delete();
    });

exports.addGroupToMember = functions.firestore
    .document('groups/{groupID}/member_ref/{memberID}')
    .onCreate(event => {
        //group에 초대한 user의 participated_ref에 해당 group 추가
        db.collection('users/' + event.params.memberID + '/participated_group').doc(event.params.groupID).set({
            group_ref : event.params.groupID
        });
    });

exports.deleteMemberInGroup = functions.firestore
    .document('user/{userID}/participated_group/{group_ID}')
    .onDelete(event => {
        //user 탈퇴한 group의 member_ref에서 해당 user 삭제
        db.collection('groups/' + event.params.groupID + '/member_ref').doc(event.params.userID).delete();
    });