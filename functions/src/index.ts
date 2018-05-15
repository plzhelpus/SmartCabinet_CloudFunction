// 현재 파이어베이스 API를 통해 호출되는 함수들의 JSON 반환값은 클라이언트가 고려하지 않음.
// 그러니 적당히 의미있는 값을 반환하면 됨.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();

const db = admin.firestore();

/**
 * 지정된 컬렉션의 모든 문서를 삭제함.
 * @param collectionPath 삭제할 컬렉션의 경로
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 */
function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, batchSize, resolve, reject);
  });
}

/**
 * 쿼리로 불러온 모든 문서를 삭제함.
 * @param query 삭제할 문서들의 쿼리
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 * @param resolve Promise.resolve()
 * @param reject Promise.reject()
 */
function deleteQueryBatch(query, batchSize, resolve, reject) {
  query
    .get()
    .then(snapshot => {
      if (snapshot.size == 0) {
        return 0;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then(numDeleted => {
      if (numDeleted === 0) {
        resolve();
        return;
      }
      process.nextTick(() => {
        deleteQueryBatch(query, batchSize, resolve, reject);
      });
    })
    .catch(reject);
}

/**
 * 그룹에서 해당 역할을 가지는 모든 유저들을 삭제함.
 * 주의 : 해당 함수에서 실제로 호출되는 batch의 수는 batchSize * 2입니다. 삭제될 때 해당 유저의 소속된 그룹에서도 이 그룹을 가리키는 문서를 삭제해야 하기 때문입니다.
 * @param roleCollectionPath 해당 역할을 가리키는 컬렉션의 경로
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 */
function deleteAllUserInRoleFromGroup(roleCollectionPath, batchSize) {
  const collectionRef = db.collection(roleCollectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteUserQueryBatchAndDeleteGroupInParticipatedGroup(
      query,
      batchSize,
      resolve,
      reject
    );
  });
}

/**
 * 쿼리로 불러온 유저들을 그룹에서 삭제하고 해당 유저들의 소속된 그룹 컬렉션에서도 이 그룹을 삭제함.
 * 주의 : 해당 함수에서 실제로 호출되는 batch의 수는 batchSize * 2입니다. 삭제될 때 해당 유저의 소속된 그룹에서도 이 그룹을 가리키는 문서를 삭제해야 하기 때문입니다.
 * @param query 삭제할 유저들의 쿼리
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 * @param resolve Promise.resolve()
 * @param reject Promise.reject()
 */
function deleteUserQueryBatchAndDeleteGroupInParticipatedGroup(
  query,
  batchSize,
  resolve,
  reject
) {
  query
    .get()
    .then(snapshot => {
      if (snapshot.size == 0) {
        return 0;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        const group_id = doc.ref.parent.parent.id;
        batch.delete(
          doc
            .get("user_ref")
            .collection("participated_group")
            .doc(group_id)
        );
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then(numDeleted => {
      if (numDeleted === 0) {
        resolve();
        return;
      }
      process.nextTick(() => {
        deleteUserQueryBatchAndDeleteGroupInParticipatedGroup(
          query,
          batchSize,
          resolve,
          reject
        );
      });
    })
    .catch(reject);
}

/**
 * 해당 이메일을 가진 사용자의 uid를 가져옴.
 * 주의: 만약 해당 이메일을 가진 사용자가 여러 명일 경우 정상적으로 동작하지 않음.(Firebase 인증 설정 참고)
 * @param email 찾으려는 사용자의 이메일
 * @returns 해당 유저의 uid, 존재하지 않으면 null
 */
function findUserIdByEmail(email) {
  return admin
    .auth()
    .getUserByEmail(email)
    .then(userRecord => {
      return userRecord.email;
    });
}

/**
 * 해당 그룹 이름을 가진 그룹이 이미 존재하는지 확인함.
 * @param groupName 그룹 이름
 * @returns 그룹이 존재하면 true, 아니면 false
 */
function isGroupExist(groupName) {
  const collectionRef = db.collection("groups");
  return collectionRef
    .where("group_name", "==", groupName)
    .get()
    .then(snapshot => {
      if (snapshot.size == 0) {
        return false;
      }
      return true;
    });
}

/**
 * 해당 사용자가 이 그룹의 소유자나 관리자인지 확인함.
 * @param groupId 그룹의 id
 * @param userId 사용자의 uid
 * @returns 해당 그룹의 관리자나 소유자이면 true, 그 이외는 false
 */
function isAdminOrOwnerInGroup(groupId, userId) {
  const userRef = db.collection("users").doc(userId);
  const groupRef = db.collection("groups").doc(groupId);
  const groupAdminRef = groupRef.collection("admin_ref");
  // 해당 유저가 소유자인지 확인
  return groupRef.get().then(groupDoc => {
    if (userRef != groupDoc.get("owner_ref")) {
      return groupAdminRef
        .doc(userRef.id)
        .get()
        .then(findResultFromAdmin => {
          if (!findResultFromAdmin.exists) {
            return false;
          }
          return true;
        });
    }
    return true;
  });
}

/**
 * 그룹의 새 회원을 추가함.
 * data에는 다음과 같은 키값이 포함된다.
 * groupId: 회원을 추가할 그룹의 문서 ID(groups/{groupId})
 * email: 새로 추가될  회원의 email
 * 자세한 내용은 '클라우드함수 직접호출' 문서 참고
 */
exports.addMemberToGroup = functions.https.onCall((data, context) => {
  return isAdminOrOwnerInGroup(data.groupId, context.auth.uid)
    .then(isAdminOrOwner => {
      if (!isAdminOrOwner) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Permission denied"
        );
      }
      return findUserIdByEmail(data.email);
    })
    .then(user_id => {
      if (user_id == null) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "User not exist"
        );
      }
      // FIXME: 만약 둘 중 하나만 성공한다면 DB가 오염됨.
      return Promise.all([
        db
          .collection("groups")
          .doc(data.groupId)
          .collection("member_ref")
          .doc(user_id)
          .set({
            email: data.email,
            user_ref: user_id
          }),
        db
          .collection("users")
          .doc(user_id)
          .collection("participated_group")
          .doc(data.groupId)
          .set({
            group_name: data.groupName,
            group_ref: data.groupId
          })
      ]);
    })
    .then(writeResult => {
      console.log(
        "Add user as member in group and group as participated_group in user"
      );
      return {
        email: data.email
      };
    });
});

/**
 * 그룹의 새 사물함을 추가함.
 * data에는 다음과 같은 키값이 포함된다.
 * groupId: 사물함을 추가할 그룹의 문서 ID(groups/{groupId})
 * cabinetId: 추가할 사물함의 cabinets 컬렉션 내의 문서의 ID(cabinets/{cabinetId})
 * serialKey: 추가할 사물함의 시리얼 키
 */
exports.addCabinetToGroup = functions.https.onCall((data, context) => {
  return isAdminOrOwnerInGroup(data.groupId, context.auth.uid)
    .then(isAdminOrOwner => {
      if (!isAdminOrOwner) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Permission denied"
        );
      }
      return db
        .collection("cabinets")
        .doc(data.cabinetId)
        .get();
    })
    .then(cabinetDoc => {
      if (cabinetDoc == null && !cabinetDoc.exists) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Cabinet not exist"
        );
      }
      const expectedSerialKey = cabinetDoc.get("serial_key");
      if (expectedSerialKey != data.serialKey) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid serial key"
        );
      }
      const groupRefOfCabinet = cabinetDoc.get("group_ref");
      if (groupRefOfCabinet != null) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Cabinet already has group"
        );
      }
    })
    .then(() => {
      db
        .collection("groups")
        .doc(data.groupId)
        .collection("cabinet_ref")
        .doc(data.cabinetId)
        .set({
          cabinet_ref: data.cabinetId,
          description: ""
        })
        .then(() => {
          console.log("add cabinet to specific group");
          return {
            cabinetId: data.cabinetId,
            groupId: data.groupId
          };
        });
    });
});

/**
 * 새 그룹을 추가함.
 * data에는 다음과 같은 키값이 포함된다.
 * groupName: 새로 생성될 그룹의 이름
 */
exports.createGroup = functions.https.onCall((data, context) => {
  return isGroupExist(data.groupName)
    .then(isThisGroupExist => {
      if (isThisGroupExist) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Duplicated group name"
        );
      }
      return admin.auth().getUser(context.auth.uid);
    })
    .then(ownerUserRecord => {
      return db
        .collection("groups")
        .add({
          group_name: data.groupName,
          owner_ref: db.collection("users").doc(ownerUserRecord.uid),
          owner_email: ownerUserRecord.email
        })
        .then(groupRef => {
          return db
            .collection("users")
            .doc(ownerUserRecord.uid)
            .collection("participated_group")
            .doc(groupRef.id)
            .set({
              group_name: data.groupName,
              group_ref: groupRef
            });
        })
        .then(result => {
          console.log("create new group");
          return { groupName: data.groupName };
        });
    });
});

/**
 * 사물함을 열거나 닫음.
 * data에는 다음과 같은 키값이 포함된다.
 * cabinetId: 열려고 하는 사물함의 cabinets 컬렉션 내의 문서의 ID(cabinets/{cabinetId})
 */
exports.openOrCloseCabinet = functions.https.onCall((data, context) => {
  // TODO: 해당 사물함이 존재하는지 확인함.
  // TODO: 해당 사용자가 사물함을 열 권한이 있는지 확인함.
  // TODO: 해당 사물함의 RealtimeDB에서의 열림 상태를 받아와서 바꿈.
});

/**
 * 사용자가 가입할 때, 해당 사용자의 문서를 users 컬렉션에 생성함.
 */
exports.createUser = functions.auth.user().onCreate((userRecord, context) => {
  return db
    .collection("users")
    .doc(userRecord.uid)
    .set({
      email: userRecord.email
    })
    .then(() => {
      console.log("User firebase is added at ${res.updateTime}");
    });
});

/**
 * 사물함이 그룹에서 제외될 때, cabinets 컬렉션에 있는 해당 사물함 문서에서 이 그룹을 가리키는 레퍼런스를 없앰.
 */
exports.deleteCabinetInGroup = functions.firestore
  .document("groups/{groupId}/cabinet_ref/{cabinetId}")
  .onDelete((snap, context) => {
    return db
      .collection("cabinets")
      .doc(context.params.cabinetId)
      .update({
        group_ref: null
      })
      .then(res => {
        console.log("Group is deleted from cabinet at ${res.updateTime}");
      });
  });

/**
 * 사용자가 탈퇴할 때, users 컬렉션에 있는 해당 사용자 문서를 삭제함.
 * 주의: 이 함수는 해당 사용자가 아무런 그룹에도 속하지 않았을 때를 가정하고 동작합니다. 만약 소속된 그룹에 대한 처리가 필요하다면 수정하세요.
 */
exports.deleteUser = functions.auth.user().onDelete((userRecord, context) => {
  return db
    .collection("users")
    .doc(userRecord.uid)
    .delete();
});

/**
 * 그룹 문서가 삭제될 때, 모든 사용자와 사물함을 그룹에서 제외함.
 */
exports.deleteAllFromGroup = functions.firestore
  .document("groups/{groupId}")
  .onDelete((snap, context) => {
    const group_doc_path = "groups/" + context.params.groupId;
    // FIXME: 만약 이 중 하나가 실패할 경우 DB가 오염됨
    return Promise.all([
      db
        .doc(snap.get("owner_ref"))
        .collection("participated_group")
        .doc(context.params.groupId)
        .delete(),
      deleteAllUserInRoleFromGroup(group_doc_path + "/admin_ref/", 100),
      deleteAllUserInRoleFromGroup(group_doc_path + "/member_ref/", 100),
      deleteCollection(group_doc_path + "/cabinet_ref/", 100)
    ]).then(() => {
      console.log("delete all lower documents and nested information.");
      return { groupId: snap.id };
    });
  });
