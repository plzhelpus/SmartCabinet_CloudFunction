// 현재 파이어베이스 API를 통해 호출되는 함수들의 JSON 반환값은 클라이언트가 고려하지 않음.
// 그러니 적당히 의미있는 값을 반환하면 됨.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();

const db = admin.firestore();
const realtimeDb = admin.database();

/**
 * 지정된 컬렉션의 모든 문서를 삭제함.
 * @param collectionRef 삭제할 컬렉션의 CollectionReference
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 */
function deleteCollection(collectionRef, batchSize) {
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
      if (snapshot.size === 0) {
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
 * @param collectionRef 해당 역할을 가리키는 컬렉션의 CollectionReference
 * @param batchSize 삭제할 문서를 검색할 때 한번에 불러올 문서 수
 */
function deleteAllUserInRoleFromGroup(collectionRef, batchSize) {
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteGroupUserQueryBatch(query, batchSize, resolve, reject);
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
function deleteGroupUserQueryBatch(query, batchSize, resolve, reject) {
  query
    .get()
    .then(snapshot => {
      if (snapshot.size === 0) {
        return 0;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        // TODO: 되는건지 안되는건지 테스트 필요
        batch.delete(doc.ref);
        batch.delete(
          doc
            .get("user_ref")
            .collection("participated_group")
            .doc(doc.ref.parent.parent.id)
        );
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
        deleteGroupUserQueryBatch(query, batchSize, resolve, reject);
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
      return userRecord.uid;
    })
    .catch(error => {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User not exist"
      );
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
      if (snapshot.size === 0) {
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
  const groupRef = db.collection("groups").doc(groupId);
  const groupAdminRef = groupRef.collection("admin_ref");

  return groupRef.get().then(groupDoc => {
    // 해당 유저가 소유자가 아니라면 관리자인지 확인
    if (userId !== groupDoc.get("owner_ref").id) {
      return groupAdminRef
        .doc(userId)
        .get()
        .then(findResultFromAdmin => {
          return findResultFromAdmin.exists;
        });
    }
    return true;
  });
}

/**
 * 해당 사용자가 이 그룹의 일반 회원인지 확인함.
 * @param groupId 그룹의 id
 * @param userId 사용자의 uid
 * @returns 해당 그룹의 일반 회원이면 true, 그 이외는 false
 */
function isGroupMember(groupId, userId) {
  return db
    .collection("groups")
    .doc(groupId)
    .collection("member_ref")
    .doc(userId)
    .get()
    .then(findResultFromMember => {
      return findResultFromMember.exists;
    });
}

/**
 * 그룹의 새 회원을 추가함.
 * data에는 다음과 같은 키값이 포함된다.
 * groupId: 회원을 추가할 그룹의 문서 ID(groups/{groupId})
 * email: 새로 추가될  회원의 email
 * 자세한 내용은 '클라우드함수 직접호출' 문서 참고
 */
exports.addMemberInGroup = functions.https.onCall((data, context) => {
  return findUserIdByEmail(data.email)
    .then(user_id => {
      if (user_id === null) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "User not exist"
        );
      }
      return db
        .collection("users")
        .doc(user_id)
        .collection("participated_group")
        .doc(data.groupId)
        .get()
        .then(resultDoc => {
          if (resultDoc !== null && resultDoc.exists) {
            throw new functions.https.HttpsError(
              "invalid-argument",
              "User is already in this group"
            );
          }
          return isAdminOrOwnerInGroup(data.groupId, context.auth.uid);
        })
        .then(isAdminOrOwner => {
          if (!isAdminOrOwner) {
            throw new functions.https.HttpsError(
              "invalid-argument",
              "Permission denied"
            );
          }
          return db.runTransaction(transaction => {
            return transaction
              .get(db.collection("groups").doc(data.groupId))
              .then(groupDoc => {
                if (!groupDoc.exists) {
                  throw new functions.https.HttpsError(
                    "invalid-argument",
                    "Group not exist"
                  );
                }
                transaction.create(
                  groupDoc.ref.collection("member_ref").doc(user_id),
                  {
                    email: data.email,
                    user_ref: db.collection("users").doc(user_id)
                  }
                );
                transaction.create(
                  db
                    .collection("users")
                    .doc(user_id)
                    .collection("participated_group")
                    .doc(data.groupId),
                  {
                    group_name: groupDoc.get("group_name"),
                    group_ref: groupDoc.ref
                  }
                );
                return;
              });
          });
        });
    })
    .then(() => {
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
exports.addCabinetInGroup = functions.https.onCall((data, context) => {
  return isAdminOrOwnerInGroup(data.groupId, context.auth.uid)
    .then(isAdminOrOwner => {
      if (!isAdminOrOwner) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Permission denied"
        );
      }
      return db.runTransaction(transaction => {
        return transaction
          .get(db.collection("cabinets").doc(data.cabinetId))
          .then(cabinetDoc => {
            if (cabinetDoc === null || !cabinetDoc.exists) {
              throw new functions.https.HttpsError(
                "invalid-argument",
                "Cabinet not exist"
              );
            }
            const expectedSerialKey = cabinetDoc.get("serial_key");
            if (expectedSerialKey !== data.serialKey) {
              throw new functions.https.HttpsError(
                "invalid-argument",
                "Invalid serial key"
              );
            }
            const groupRefOfCabinet = cabinetDoc.get("group_ref");
            if (groupRefOfCabinet !== null) {
              throw new functions.https.HttpsError(
                "invalid-argument",
                "Cabinet already has group"
              );
            }
            transaction.create(
              db
                .collection("groups")
                .doc(data.groupId)
                .collection("cabinet_ref")
                .doc(data.cabinetId),
              {
                cabinet_ref: db.collection("cabinets").doc(data.cabinetId),
                description: ""
              }
            );
            transaction.update(db.collection("cabinets").doc(data.cabinetId), {
              group_ref: db.collection("groups").doc(data.groupId)
            });
            return;
          });
      });
    })
    .then(() => {
      console.log("add cabinet to specific group");
      return {
        cabinetId: data.cabinetId,
        groupId: data.groupId
      };
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
      const batch = db.batch();
      const groupRef = db.collection("groups").doc();
      batch.set(groupRef, {
        group_name: data.groupName,
        owner_ref: db.collection("users").doc(context.auth.uid),
        owner_email: context.auth.token.email
      });
      batch.set(
        db
          .collection("users")
          .doc(context.auth.uid)
          .collection("participated_group")
          .doc(groupRef.id),
        {
          group_name: data.groupName,
          group_ref: groupRef
        }
      );
      return batch.commit();
    })
    .then(results => {
      console.log("create new group");
      return { groupName: data.groupName };
    });
});

/**
 * 사물함을 열거나 닫음.
 * data에는 다음과 같은 키값이 포함된다.
 * cabinetId: 열려고 하는 사물함의 cabinets 컬렉션 내의 문서의 ID(cabinets/{cabinetId})
 */
exports.openOrCloseCabinet = functions.https.onCall((data, context) => {
  return db
    .collection("cabinets")
    .doc(data.cabinetId)
    .get()
    .then(cabinetDoc => {
      if (cabinetDoc === null || !cabinetDoc.exists) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Cabinet not exist"
        );
      }
      const groupRefOfCabinet = cabinetDoc.get("group_ref");
      // 그룹에 속하지 않은 사물함도 열 권한이 없다고 간주함.
      if (groupRefOfCabinet === null) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Permission denied"
        );
      }
      return isGroupMember(groupRefOfCabinet.id, context.auth.uid).then(
        isMember => {
          if (!isMember) {
            return isAdminOrOwnerInGroup(
              groupRefOfCabinet.id,
              context.auth.uid
            );
          }
          return true;
        }
      );
    })
    .then(permissionResult => {
      if (!permissionResult) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Permission denied"
        );
      }

      const openStateRef = realtimeDb.ref(
        "cabinets/" + data.cabinetId + "/open_state"
      );
      return openStateRef
        .transaction(openState => {
          return !openState;
        })
        .then(value => {
          if (value.committed) {
            console.log("request open/close cabinet - " + value.snapshot.val());
          }
          return {
            cabinetId: data.cabinetId,
            openState: value.snapshot.val()
          };
        });
    });
});

/**
 * 해당 그룹을 나감.
 * data에는 다음과 같은 키값이 포함된다.
 * groupId: 나가려는 그룹의 ID(groups/{groupId})
 */
exports.leaveGroup = functions.https.onCall((data, context) => {
  return db.runTransaction(transaction => {
    const userId = context.auth.uid;
    const groupRef = db.collection("groups").doc(data.groupId);
    return transaction
      .getAll(
        groupRef.collection("admin_ref").doc(userId),
        groupRef.collection("member_ref").doc(context.auth.uid)
      )
      .then(docs => {
        const adminDoc = docs[0];
        const memberDoc = docs[1];
        if (!adminDoc.exists && !memberDoc.exists) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "User is not admin nor member"
          );
        }
        // 꼼수: 두 문서를 참조했기 때문에, 현재 Firestore에서 제공하는 트랜젝션 제약사항 상, 둘 다 삭제해야 함.
        transaction.delete(memberDoc.ref);
        transaction.delete(adminDoc.ref);
        transaction.delete(
          db
            .collection("users")
            .doc(userId)
            .collection("participated_group")
            .doc(data.groupId)
        );
      });
  });
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
    .then(res => {
      console.log("User is added in firebase");
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
        console.log("Group is deleted from cabinet");
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
    .delete()
    .then(res => {
      console.log("User is deleted from firebase");
    });
});

/**
 * 그룹 문서가 삭제될 때, 모든 사용자와 사물함을 그룹에서 제외함.
 */
exports.deleteAllFromGroup = functions.firestore
  .document("groups/{groupId}")
  .onDelete((snap, context) => {
    // FIXME: 만약 이 중 하나가 실패할 경우 DB가 오염됨 (현재로서는 이 모든 작업을 하나로 묶을 수 없음)
    return Promise.all([
      snap
        .get("owner_ref")
        .collection("participated_group")
        .doc(context.params.groupId)
        .delete(),
      deleteAllUserInRoleFromGroup(snap.ref.collection("admin_ref"), 50),
      deleteAllUserInRoleFromGroup(snap.ref.collection("member_ref"), 50),
      deleteCollection(snap.ref.collection("cabinet_ref"), 100)
    ]).then(() => {
      console.log("delete all lower documents and nested information.");
      return { groupId: snap.id };
    });
  });
