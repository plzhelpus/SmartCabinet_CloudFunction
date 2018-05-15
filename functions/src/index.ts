import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();
// const batch = db.batch();

exports.createUser = functions.auth.user().onCreate((userRecord, context) => {
    //Create users/userID
    return db.collection('users').doc(userRecord.uid).set({
        email: userRecord.email
    }).then(() => {
        console.log('User firebase is added at ${res.updateTime}')
    });
});

function deleteCollection(collectionPath, batchSize) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, batchSize, resolve, reject);
    });
}

function deleteCollection_nested(collectionPath, batchSize) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatchAndDocs(query, batchSize, resolve, reject);
    });
}

function deleteQueryBatch(query, batchSize, resolve, reject) {
    query.get().then((snapshot) => {
        if (snapshot.size === 0) {
            return 0;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        return batch.commit().then(() => {
            return snapshot.size;
        });
    }).then((numDeleted) => {
        if (numDeleted === 0) {
            resolve();
            return;
        }
        process.nextTick(() => {
            deleteQueryBatch(query, batchSize, resolve, reject);
        });
    }).catch(reject);
}

function deleteQueryBatchAndDocs(query, batchSize, resolve, reject) {
    query.get().then((snapshot) => {
        if (snapshot.size === 0) {
            return 0;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            const group_id = doc.ref.parent.parent.id;
            batch.delete(doc.get('user_ref').collection('participated_group').doc(group_id));
            batch.delete(doc.ref);
        });

        return batch.commit().then(() => {
            return snapshot.size;
        });
    }).then((numDeleted) => {
        if (numDeleted === 0) {
            resolve();
            return;
        }
        process.nextTick(() => {
            deleteQueryBatchAndDocs(query, batchSize, resolve, reject);
        });
    }).catch(reject);
}

exports.deleteUser = functions.auth.user().onDelete((userRecord, context) => {
    //delete users/userID
    return db.collection('users').doc(userRecord.uid).delete().then(() => {
        return deleteCollection('users/' + userRecord.uid + '/participated_group/', 100);
    });
});

exports.deleteAllFromGroup = functions.firestore
    .document('groups/{groupID}')
    .onDelete((snap, context) => {
        return Promise.all([
            db.doc(snap.get("owner_ref")).collection('participated_group').doc(context.params.groupID).delete(),
            deleteCollection_nested('groups/' + context.params.groupID + '/admin_ref/', 100),
            deleteCollection_nested('groups/' + context.params.groupID + '/member_ref/', 100),
            deleteCollection('groups/' + context.params.groupID + '/cabinet_ref/', 100)
        ]).then(function () {
            console.log('delete all lower documents and nested information.');
        });
        //TODO: delete All lower collections in this document.
    });

exports.deleteGroupInCabinet = functions.firestore
    .document('groups/{groupID}/cabinet_ref/{cabinetID}')
    .onDelete((snap, context) => {
        //cabinet_ref에 속한 cabinet의 group_ref에서 그룹 정보 초기화
        return db.collection('cabinets').doc(context.params.cabinetID).update({
            "group_ref": null
        }).then(res => {
            console.log('Group is deleted from cabinet at ${res.updateTime}');
        });
    });

function findUserRef(collectionPath, email) {
    const collectionRef = db.collection(collectionPath);
    return collectionRef.where('email', '==', email).get().then((snapshot) => {
        if (snapshot.size === 0) {
            throw new HttpsError('invalid-argument', 'User not exist');
        }
        else {
            return snapshot.docs()[0].id;
        }
    });
}

function hasAuthority(docPath, userID) {
    const userRef = db.collection('users').doc(userID);
    const groupRef = db.doc(docPath);
    const groupAdminRef = groupRef.collection('admin_ref');
    return groupRef.get().then((groupDoc) => {
        if (userRef != groupDoc.get('owner_ref')) {
            return groupAdminRef.doc(userRef.id).get().then((adminDoc) => {
                if (!adminDoc.exists){
                    throw new HttpsError('invalid-argument', 'Permission denied');
                }
            });
        }
    });
}

exports.addMemberToGroup = functions.https.onCall((data, context) => {
    return hasAuthority('groups/' + data.groupID, context.params.id).then(() => {
        return findUserRef('users/', data.email);
    }).then((user_id) => {
        return db.collection('groups').doc(data.groupID).collection('member_ref').doc(user_id).set({
            "email": data.email,
            "user_ref": user_id
        });
    }).then((user_id) => {
        db.collection('users').doc(user_id).collection('participated_group').doc(data.groupID).set({
            "group_name": data.groupName,
            "group_ref": data.groupID
        });
    }).then(() => {
        console.log('Add user as member in group and group as participated_group in user');
    });
    //TODO : email을 users{userID}에서 찾아서 있으면 그 userID 사용, 없으면 error 뱉기
    //TODO : 유저가 관리자 혹은 소유자인지 확인해야 함.
    //TODO : 파라미터 확인. context.uid 등 삭제
});

exports.addCabinetToGroup = functions.https.onCall((data, context) => {
    //cabinet가 가진 group_refo의 cabinet_refo에 해당 cabinet 추가
    return db.collection('groups').doc(data.groupID).collection('cabinet_ref').doc(data.cabinetID).set({
        cabinet_ref: data.cabinetID,
        description: ''
    }).then(() => {
        console.log('add cabinet to specific group');
        return {cabinet_ref: data.cabintID};
    });
    //TODO : 요청자가 해당 그룹의 owner나 admin인지 확인
    //TODO : 사물함이 존재하는지 검사
    //TODO : 해당 사물함의 시리얼 키가 맞는지 검사
    //TODO : 이미 사물함이 다른 그룹에 등록되어 있는지 검사
    //TODO : 위 경우에 어긋나면 error 뱉기
});

exports.createGroup = functions.https.onCall((datam, context) => {
    console.log();
});