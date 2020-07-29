/**
 * Helper functions for using pouchDB for localStorage. 
 *  By Cody Ford
 *
 *  Misc Notes:
 * 
 *  btoa('hello world')      // "aGVsbG8gd29ybGQ="   // to base64
 *  atob('aGVsbG8gd29ybGQ=') // "hello world"
 * 
 * 'text/plain' for plain text, 'image/png' for PNG images, and 'image/jpeg' for JPG images. 
 *  URL.createObjectURL()
 *  getAttachment() returns blobs, other methods default to base64.
 *  Check if a var is a blob:  console.log(myBlob.constructor.name === 'Blob'); // true
 *  new Blob(['Is there life on Mars?'], {type: 'text/plain'})
 * 
 *  If you're worried about ID collisions, you could also use new Date().toJSON() + Math.random(). 
 */

var dbRevisions = {};
var dbAttachments = {};

/**************************************************************************************/
function getDB(dbName, revLimit, compact){
    if(typeof revLimit == "undefined") revLimit = 1;
    if(typeof compact == "undefined") compact = true;
    return new PouchDB(dbName, {revs_limit: revLimit, auto_compaction: compact});
}

/**************************************************************************************/
function getDBInfo(db){
    return Promise.resolve(
        db.info().then(function(info){
            return info; // {"doc_count":0,"update_seq":0,"db_name":"kittens"}
        })
    );
}

/**************************************************************************************/
function dbDelete(db){
    showSave();
    return Promise.resolve(
        db.destroy().then(function(){
            dbRevisions = {}; // remove any stored revisions. assumes that thier is only one db. 
            dbAttachments = {};
            console.log("Database Deleted");
            return {"ok": true};
        }).catch(function(e){
            console.error("dbDelete: \t" + e);
            return {"error": true};
        }).finally(function(){
            if(hideSave) hideSave();
        })
    ); 
}

/**************************************************************************************/
function dbGetAllDocs(db, options){
    showSpinner();
    var opt = {};
    if(typeof options !== "undefined") opt = options;
    return Promise.resolve(
        db.allDocs(opt).then(function(result){
            result.rows.forEach(function(row){               
                dbRevisions[row.key] = row.value.rev;
                if(row.doc) dbAttachments[row.key] = row.doc._attachments;
            });
            return result;
        }).catch(function(e){
            console.error("dbGetAllDocs: \t" + e);
            return {error: true};
        }).finally(function(){
            if(hideSpinner) hideSpinner();
        })
    );
}

/**************************************************************************************/
function dbLogAllDocs(db){
    return Promise.resolve(
        dbGetAllDocs(db, {include_docs: true, attachments: true}).then(function(docs){
            if(!docs.error) console.log(docs.rows);
            return {"ok": true};
        })
    );
}

/**************************************************************************************/
function dbGetAllPrefixedDocs(db, prefix, incDocs, incAtt, attAsBlob){
    var options = { startkey: prefix, endkey: prefix + "\ufff0" };
    if(typeof incDocs !== "undefined") options.include_docs = incDocs;
    if(typeof incAtt !== "undefined") options.attachments = incAtt;
    if(typeof attAsBlob !== "undefined") options.binary = attAsBlob;
    return Promise.resolve(
        dbGetAllDocs(db, options)
    );
}

/**************************************************************************************/
function dbPutDoc(db, id, content){
    showSave();
    var putData = { _id: id, docContent: content };
    if(typeof dbRevisions[id] !== "undefined") putData._rev = dbRevisions[id];
    if(typeof dbAttachments[id] !== "undefined") putData._attachments = dbAttachments[id];    
    return Promise.resolve(
        db.put(putData).then(function(result){
            if(result.ok) dbRevisions[result.id] = result.rev;
            return result;
        }).catch(function(e){
            if(e.name === "conflict"){
                return dbEnsureDocUpdate(db, id, content);
            }else{
                console.error("dbPutDoc: \t" + e);
                return {error: true}
            }             
        }).finally(function(){
            if(hideSave) hideSave();
        })
    );
}

/**************************************************************************************/
function dbEnsureDocUpdate(db, id, content){
    return Promise.resolve(
        dbGetDoc(db, id).then(function(){ // dbRevisions is updated with the new Rev.
            return dbPutDoc(db, id, content);
        })
    );
}

/**************************************************************************************/
function dbGetDoc(db, id, defaultDoc, att, attAsBlob){  
    showSpinner();
    var options = {};
    if(typeof att !== "undefined") options.attachments = att; // Include attachment data.
    if(typeof attAsBlob !== "undefined") options.binary = attAsBlob; // Return attachment data as Blobs/Buffers, instead of as base64-encoded strings.
    return Promise.resolve(
        db.get(id, options).then(function(doc){
            dbRevisions[doc._id] = doc._rev;
            dbAttachments[doc._id] = doc._attachments;
            return doc;
        }).catch(function(e){ // If defaultDoc is provided, it will return that if the doc does not exist.
            if(e.name === 'not_found' && typeof defaultDoc !== "undefined") return JSON.parse(JSON.stringify(defaultDoc));
            console.error("dbGetDoc: \t" + e);
            return {error: true}
        }).finally(function(){
            if(hideSpinner) hideSpinner();
        })    
    );
}

/**************************************************************************************/
function dbRemoveDoc(db, id){
    showSave();
    return Promise.resolve(
        dbGetDoc(db, id).then(function(doc){ // Get the most recent rev rather than trying it with a stored rev that could be wrong. 
            return db.remove(doc._id, doc._rev);
        }).then(function(){
            delete dbRevisions[id];
            delete dbAttachments[id];
            return {"ok": true}
        }).catch(function(e){
            console.error("dbRemoveDoc: \t" + e);
            return {error: true}
        }).finally(function(){
            if(hideSave) hideSave();
        })    
    );
}

/**************************************************************************************/
// Attachments are deduplicated based on their MD5 sum, so duplicate attachments won't take up extra space.
// So it might make sense to append a timestamp to the filename, just in case two diffrent files have the same filename. 
function dbBulkPutAttachments(db, id, attachmentsArray, removeAnyOtherAttachments){
    /* attachmentsArray = {
            "att.txt": {
                "content_type": "text/plain",
                "data": new Blob(["And she's hooked to the silver screen"], {type: 'text/plain'})
            },
       } */
    showSave();
    
    return Promise.resolve(
        db.get(id, {attachments: true, binary: false}).then(function(doc){
            if(typeof doc._attachments == "undefined" || removeAnyOtherAttachments == true) doc._attachments = {};
            for(var i in attachmentsArray){
                doc._attachments[i] = attachmentsArray[i];
            }
            dbAttachments[doc._id] = doc._attachments;
            return db.put(doc);  
        }).then(function(result){
            if(result.ok) dbRevisions[result.id] = result.rev;
            return {"ok": true};
        }).catch(function(e){
            console.error("dbBulkPutAttachments: \t" + e);
            return {error: true};
        }).finally(function(){
           if(hideSave) hideSave();
        })
    );
}

/**************************************************************************************/
function dbPutAttachment(db, docId, attachmentName, data, mimeType){
    showSave();
    var rev = ""; // Not using the spread operator since I am not outruling supporting IE11.
    if(typeof dbRevisions[docId] !== "undefined") rev = dbRevisions[docId];

    if(rev != ""){ 
        return Promise.resolve(
            db.putAttachment(docId, attachmentName, rev, data, mimeType).then(function(result){
                if(result.ok) dbRevisions[result.id] = result.rev;
                return dbGetDoc(db, result.id); // update the stored attachments. // might be better to always just get the doc and not store the revs at all. 
            }).then(function(){
                return {"ok": true}
            }).catch(function(e){
                if(e.name === "conflict"){
                    return dbEnsureAttachmentPut(db, docId, attachmentName, data, mimeType);
                }else{
                    console.error("dbPutAttachment: \t" + e);
                    return {error: true}
                } 
            }).finally(function(){
                if(hideSave) hideSave();
            }) 
        ); 
    }else{ // try and put the attachment without the rev, in case the doc does not exist. 
        return Promise.resolve(
            db.putAttachment(docId, attachmentName, data, mimeType).then(function(result){
                if(result.ok) dbRevisions[result.id] = result.rev;
                return dbGetDoc(db, result.id);
            }).then(function(){
                return {"ok": true}
            }).catch(function(e){
                if(e.name === "conflict"){
                    return dbEnsureAttachmentPut(db, docId, attachmentName, data, mimeType);
                }else{
                    console.error("dbPutAttachment: \t" + e);
                    return {error: true}
                }       
            }).finally(function(){
                if(hideSave) hideSave();
            }) 
        ); 
    }
}

/**************************************************************************************/
function dbEnsureAttachmentPut(db, docId, attachmentName, data, mimeType){
    return Promise.resolve(
        dbGetDoc(db, docId).then(function(){ // dbRevisions is updated with the new Rev.
            return dbPutAttachment(db, docId, attachmentName, data, mimeType);
        })
    );
}

/**************************************************************************************/
function dbGetAttachment(db, docId, attachmentName){
    showSpinner();
    return Promise.resolve(
        db.getAttachment(docId, attachmentName).then(function(blob){
            return blob;
        }).catch(function(e){
            console.error("dbGetAttachment: \t" + e);
            return {"error": true};
        }).finally(function(){
            if(hideSpinner) hideSpinner();
        }) 
    );
}

/**************************************************************************************/
function dbDeleteAttachment(db, docId, attachmentName){
    showSave();
    return Promise.resolve(
        dbGetDoc(db, docId).then(function(doc){ // Guarantee that it has the lastest rev, rather than trying to remove first. 
            if(doc._attachments){ // Save the attachments without the one that is geing deleted.
              delete doc._attachments[attachmentName];
              dbAttachments[doc._id] = doc._attachments;
            }
            return db.removeAttachment(docId, attachmentName, dbRevisions[docId])  
        }).then(function(result){
            if(result.ok) dbRevisions[result.id] = result.rev;
            return {"ok": true};
        }).catch(function(e){
            console.error("dbDeleteAttachment: \t" + e);
            return {"error": true};
        }).finally(function(){
            if(hideSave) hideSave();
        }) 
    );
}

/**************************************************************************************/
function dbBulkCreateDoc(db, docs){  // meant to be used when initilizing database, and none of the douments currently exist. 
    showSave();
    // docs = {
    //     _id
    //     _attachments
    //     docContent
    // }
    return Promise.resolve(
        db.bulkDocs(docs).then(function(result){
            for(var i = 0; i < result.length; i++){
                if(result[i].ok) dbRevisions[result[i].id] = result[i].rev; // Save the rev.
                for(var j = 0; j < docs.length; j++){ // Save the attachments as well.
                    if(docs[j]._id == result[i].id){
                        dbAttachments[result[i].id] = docs[j]._attachments;
                        break;
                    }
                }
            }
            return {"ok": true};
        }).catch(function(e){
            console.error("dbBulkCreateDoc: \t" + e);
            return {"error": true};
        }).finally(function(){
            if(hideSave) hideSave();
        }) 
    );
}
