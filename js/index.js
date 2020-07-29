var db;
const dbName = "NoteManager";
var sidebar;
var sidebarNoteContainer;
var spinElement;
var spinner;
var editor;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var yearTemplate;
var currentMonthTemplate;
var currentId;
var currentNote;
var newNote = {
    id: "Note_",
    title: "Note 1",
    notes: "",
}
const defaultConfig = {
    lastOpened: null, 
    sidebarOpened: true,
    sidebarSort: "chronological",
    sidebarManualOrder: [],
    numberOfNotes: 0,
}
var config;

/**************************************************************************************/
document.addEventListener('DOMContentLoaded', function(){ // Main
    sidebar = document.querySelector("#sidebar");
    document.querySelector(".calendars-containder");
    spinElement = document.querySelector("#spinner");
    //fullPageDropBox = document.querySelector(".full-page-drop");
    sidebarNoteContainer = document.querySelector(".item-container");
    setupSpinner();
    createEditor();
    addDragAndDrop();
    addTooltips();
    loadNotes();
});

//***************************************************************************************
//* Note Management Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function loadNotes(){
        db = getDB(dbName);
        dbGetDoc(db, "Config", defaultConfig).then(function(response){ 
            config = typeof response._rev === "undefined" ? response : response.docContent;
            config.sidebarOpened ? document.body.classList.add("sidebar-open") : document.body.classList.remove("sidebar-open");
            if(config.lastOpened != null){
                openNote(config.lastOpened);
                loadNotesIntoSidebar(); 
            }else{ // Inital Load.
                addNewNote();
            }
        })
    }

    /**************************************************************************************/
    function addNewNote(){
        var dateNow = new Date();
        var timestamp = dateNow.toJSON();
        var thisYear = dateNow.getFullYear();
        var thisNote = JSON.parse(JSON.stringify(newNote));
        config.numberOfNotes++;     
        thisNote.title = "Note " + config.numberOfNotes; 
        thisNote.id += timestamp; 
        thisNote.lastYearViewed = thisYear;
        currentNote = thisNote;
        saveCurrentNote()
        .then(loadNotesIntoSidebar)
        .then(openNote(currentNote.id));
    }

    /**************************************************************************************/
    function openNote(id){
        config.lastOpened = id;      
        saveConfig();
        currentId = id;  
        if(typeof currentNote !== "undefined" && id == currentNote.id){ // new note, since it is called from and new note.
            changeHeaderTitle(currentNote.title);
            editor.setContents(currentNote.notes);
        }else{ // need to get the calendar from the database. 
            dbGetDoc(db, id, {"not_found": true}, true).then(function(res){   
                currentNote = res.docContent;
                content = currentNote.notes;
                var attachments = res._attachments;
                if(typeof attachments !== "undefined"){
                    Object.keys(attachments).forEach(function(attName){
                        var base64 = attachments[attName].data;
                        var base64Image = "data:" + attachments[attName].content_type + ";base64," + base64;
                        content = content.replace("{{"+attName+"}}", base64Image);
                    })
                }
                changeHeaderTitle(currentNote.title);
                editor.setContents(content);
            })
        }     
    }

    /**************************************************************************************/
    function addTooltips(){
        tippy(".toggle-sidebar", {content: 'Toggle the Visablity of the Sidebar', placement: "right"});
        tippy(".editable-title", {content: 'Edit this Note\'s Title', placement: "bottom"});
        tippy(".chronological-icon", {content: 'Note\'s are in Chronological Order', placement: "right"});
        tippy(".alphabetical-icon", {content: 'Note\'s are in Alphabetical Order', placement: "right"});
        tippy(".manual-sort-icon", {content: 'Note\'s are are Sorted Manually', placement: "right"});
    }

//#endregion

//***************************************************************************************
//* Sidebar Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function toggleSidebar(){
        var opened = document.body.classList.contains("sidebar-open");
        opened ? document.body.classList.remove("sidebar-open") : document.body.classList.add("sidebar-open");
        config.sidebarOpened = !opened;
        saveConfig();
    }

    /**************************************************************************************/
    function loadNotesIntoSidebar(){
        return Promise.resolve(
            dbGetAllPrefixedDocs(db, "Note_", true).then(function(res){ 
                var noteNodes = [];
                for(var i = 0; i < res.rows.length; i++){
                    var doc = res.rows[i].doc.docContent;
                    noteNodes.push({id: doc.id, title: doc.title})
                }
                sidebarNoteContainer.innerHTML = "";

                var sortContainer = document.querySelector(".sort-container");
                switch(config.sidebarSort){
                    case "manual": // load the saved manual order of the calendars.
                        sortContainer.classList.add("sort-manual");
                        sortContainer.classList.remove("sort-alphabetical");                
                        var tempNodes = [];
                        for(var id  of config.sidebarManualOrder){
                            for(var ob of noteNodes){
                                if(ob.id == id) tempNodes.push(ob);
                            }
                        }
                        // Need to also add any new ones that did not exist when it was manually sorted last.
                        noteNodes = noteNodes.filter(function(item){
                            return tempNodes.indexOf(item) < 0;
                        });
                        noteNodes = tempNodes.concat(noteNodes);
                        break;
                    case "alphabetical":
                        sortContainer.classList.remove("sort-manual");
                        sortContainer.classList.add("sort-alphabetical");
                        noteNodes.sort(function(a, b){
                            return a.title.toLowerCase() > b.title.toLowerCase() ? 1 : -1
                        });
                        break;
                    case "chronological":
                        sortContainer.classList.remove("sort-manual");
                        sortContainer.classList.remove("sort-alphabetical");
                        break;
                }
            
                for(var i in noteNodes){
                    var calDiv = "<div class='item-div' data-id='" + noteNodes[i].id + "' onclick='sidebarItemClicked(event);'>" 
                    + "<ion-icon class='drag-note' name='pencil-outline'></ion-icon>"
                    + "<div class='item-title' >" + noteNodes[i].title + "</div>"
                    + "</div>";
                    sidebarNoteContainer.insertAdjacentHTML("beforeend", calDiv);
                }
                
                Sortable.create(sidebarNoteContainer, {
                    animation: 150,
                    handle: '.drag-note',
                    onEnd: function(e){
                        sortContainer.classList.add("sort-manual");
                        config.sidebarSort = "manual";
                        var order = [];
                        sidebarNoteContainer.childNodes.forEach(function(item){
                            order.push(item.getAttribute("data-id"));
                        })  
                        config.sidebarManualOrder = order;
                        saveConfig();
                    }
                });
                return {"ok": true};
            })
        )
    }

    /**************************************************************************************/
    function toggleSidebarSort(){
        switch(config.sidebarSort){
            case "manual":
                config.sidebarSort = "chronological";
                break;
            case "alphabetical":
                config.sidebarSort = "chronological";
                break;
            case "chronological":
                config.sidebarSort = "alphabetical";
                break;
            default: 
                config.sidebarSort = "chronological";
        }
        saveConfig();
        loadNotesIntoSidebar();
    }
        
    /**************************************************************************************/
    function sidebarItemClicked(e){
        var el = e.srcElement;
        if(el.classList.contains("drag-note")) el = el.parentElement;
        var openId = el.getAttribute("data-id");
        if(openId != currentNote.id) openNote(openId);
    }

    /**************************************************************************************/
    function showImportData(){
        Swal.fire({
            title: '<h1>Import Note Manager Data</h1>',
            width: 660,
            padding: '50px',
            // calling the import asset function here would mean they could change the backgound image, from the import calendar data modal. 
            html: 
                '<div class="dropbox-container">\
                    <form method="post" enctype="multipart/form-data" novalidate="" class="dropbox">\
                        <div class="dropbox__input">\
                        <ion-icon  class="dropbox__icon" name="push-outline"></ion-icon>\
                        <input type="file" name="img-input" id="file" class="drop_box_file" onchange="importAsset(event);">\
                        <label for="file"><strong>Choose a file</strong><span class="box__dragndrop"> or drag it here</span>.</label>\
                        </div>\
                        <div class="dropbox__uploading">Uploading…</div>\
                    </form>\
                </div>',
            showCloseButton: true,
            showConfirmButton: false,
        })
    }

    /**************************************************************************************/
    function exportDatabaseData(){
        showSpinner();
        var zip = new JSZip();
        dbGetAllDocs(db, {include_docs: true, attachments: true}).then(function(res){
            var rows = res.rows;
            for(var i = 0; i < rows.length; i++){
                var docFolder = zip.folder(rows[i].id);
                var theseAttachments = rows[i].doc._attachments;
                for(var j in theseAttachments ){
                    docFolder.file(j, theseAttachments[j].data,  {base64: true});
                }
                docFolder.file(rows[i].doc._id, JSON.stringify(rows[i].doc.docContent), {base64: false});
            }
           downloadZip(zip, "Notes_" + new Date().toJSON());
        })      
    }

    /**************************************************************************************/
    function downloadZip(zip, filename){
        zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 9 }
        }).then(function(blob){   
            var dlA = document.createElement('a');
            dlA.setAttribute("href", URL.createObjectURL(blob) );
            dlA.setAttribute("download", filename + ".zip");
            dlA.click();
            URL.revokeObjectURL(dlA.href);
        }).catch(function(e){
            console.log("downloadZip: ", e);
        }).finally(hideSpinner)
    }

    /**************************************************************************************/
    function deleteData(){
        Swal.fire({
            title: 'Are you sure?',
            text: 'This will delete all of your Notes!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'No, keep it',
        }).then(function(result){
            if(result.value){
                dbDelete(db).then(function(){
                    db = getDB(dbName);
                    config = JSON.parse(JSON.stringify(defaultConfig));
                    config.sidebarOpened ? document.body.classList.add("sidebar-open") : document.body.classList.remove("sidebar-open");
                    addNewNote();
                    Swal.fire('Deleted!', 'All Notes have been deleted.', 'success');
                })
            }else if (result.dismiss === Swal.DismissReason.cancel) {
                Swal.fire('Cancelled', 'Your data was not deleted.','error');
            }
        });
    }

    /**************************************************************************************/
    function showAboutInforamtion(){
        Swal.fire({
            title: '<h1>Note Manager</h1>',
            width: 660,
            padding: '50px',
            html: 
                '<div class="about-info">\
                    <p>\
                        Note Manager saves all of your data local in your browser. There is no server that it syncs your notes with.\
                    </p>\
                    <p>\
                       This application is intended to offer an alternative store notes on your computer.\
                       Whenever I think of something that I want to work on but don\'t currently have time to do so, I have the habit of simply writting down it down inside of Sticky Notes.\
                    </p>\
                    <p>\
                       The probem is that I don\'t ever actually refer back to these notes to review what I have written. My notes inevitably to be very cluttered and unorganized. They often even have multiple notes reminding me of the same thing.\
                    </p>\
                    <p>\
                       This application is intended to provide a bit more structure to taking notes. The ablity to include images and create tables will hopefully make it easier to create meaningfull notes that you will actually refer back to. \
                    </p>\
                </div>',
            showCloseButton: true,
            showConfirmButton: false,
        })
    }

//#endregion

//***************************************************************************************
//* Header Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function changeHeaderTitle(newTitle){
        document.querySelector(".editable-title").innerHTML = newTitle;
    }

    /**************************************************************************************/
    function saveNewCalendarTitle(e){ // Could limit the length. around 21 chars are what fits before the sidebar starts shrinking the ionicon
        var titleDiv = document.querySelector(".editable-title");
        var title = titleDiv.innerText;  
        if(e.data != " "){ // Don't Check user input if the input is a space. 
            var caretPos = getCaretCharacterOffsetWithin(titleDiv);
            var oldLength = title.length;    
            title = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Remove chars I don't want to allow. 
            title = title.replace(/[^0-9a-zA-Z\s]/g, "");  
            if(title.length > 0){
                titleDiv.innerHTML = title;
                if(caretPos >= 0 && caretPos <= title.length){
                    oldLength > title.length ? setCaret(caretPos-1) : setCaret(caretPos); // If the newly added char was removed by the regex then set cursor positon back one.
                }else{
                    setCaret(title.length)
                }
            }else{
                titleDiv.innerHTML = " "; // If you set it to an empty string you loose the caret. So, insert a spcae to prevent that. 
            }
        }
        currentNote.title = title;
        saveCurrentNote();
        loadNotesIntoSidebar();
    }

    /**************************************************************************************/
    function setCaret(newPos){ // http://jsfiddle.net/zer00ne/pLqnsxv2/
        var el = document.querySelector(".editable-title");
        var range = document.createRange();
        var sel = window.getSelection();
        if(typeof el.childNodes[0] !== "undefined") range.setStart(el.childNodes[0], newPos);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        el.focus();
    }

    /**************************************************************************************/
    function getCaretCharacterOffsetWithin(element){ // https://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container/4812022#4812022
        var caretOffset = 0;
        var doc = element.ownerDocument || element.document;
        var win = doc.defaultView || doc.parentWindow;
        var sel;
        if(typeof win.getSelection !== "undefined"){
            sel = win.getSelection();
            if(sel.rangeCount > 0){
                var range = win.getSelection().getRangeAt(0);
                var preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(element);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                caretOffset = preCaretRange.toString().length;
            }
        }else if( (sel = doc.selection) && sel.type != "Control"){
            var textRange = sel.createRange();
            var preCaretTextRange = doc.body.createTextRange();
            preCaretTextRange.moveToElementText(element);
            preCaretTextRange.setEndPoint("EndToEnd", textRange);
            caretOffset = preCaretTextRange.text.length;
        }
        return caretOffset;
    }

    /**************************************************************************************/
    function setupSpinner(){
        spinner = new Spin.Spinner({
            lines: 14, // The number of lines to draw
            length: 38, // The length of each line
            width: 17, // The line thickness
            radius: 45, // The radius of the inner circle
            scale: 0.1, // Scales overall size of the spinner
            corners: 1, // Corner roundness (0..1)
            color: '#ffffff', // CSS color or array of colors
            fadeColor: 'transparent', // CSS color or array of colors
            speed: 1, // Rounds per second
            rotate: 0, // The rotation offset
            animation: 'spinner-line-fade-quick', // The CSS animation name for the lines
            direction: 1, // 1: clockwise, -1: counterclockwise
            zIndex: 2e9, // The z-index (defaults to 2000000000)
            className: 'spinner', // The CSS class to assign to the spinner
            top: '50%', // Top position relative to parent
            left: '50%', // Left position relative to parent
            shadow: '0 0 1px transparent', // Box-shadow for the lines
            position: 'absolute' // Element positioning
        }).spin(spinElement);
        hideSpinner();
    }

    /**************************************************************************************/
    function showSpinner(){
       spinner.spin(spinElement);
    }

    /**************************************************************************************/
    function hideSpinner(){
       spinner.stop();
    }

//#endregion

//***************************************************************************************
//*  Save Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function showSave(){
        var saveIcon = document.querySelector("ion-icon[name='save-sharp']");
        saveIcon.classList.add("saving");
    }

    /**************************************************************************************/
    function hideSave(){
        var saveIcon = document.querySelector("ion-icon[name='save-sharp']");
        saveIcon.classList.remove("saving");
    }

    /**************************************************************************************/
    function saveConfig(){
        return dbPutDoc(db, "Config", config);
    }

    /**************************************************************************************/
    function saveCurrentNote(){
        return dbPutDoc(db, currentNote.id, currentNote);
    }

    /**************************************************************************************/
    function deleteNote(){
        Swal.fire({
            title: 'Are you sure?',
            text: 'You want to delete: ' + currentNote.title,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'No, keep it'
        }).then((result) => {
            if(result.value){
                // Could update the number of notes in config, but it would be possible for it to give multiple notes the same inital name.
                var previousNote = document.querySelector("div[data-id='" + currentId + "']").previousElementSibling; 
                var previousId;
                if(previousNote) previousId = previousNote.getAttribute("data-id");
                dbRemoveDoc(db, currentId).then(function(){
                    return loadNotesIntoSidebar();
                }).then(function(){
                    var sidebarDivs = document.querySelectorAll(".item-div");
                    if(sidebarDivs.length == 0){
                        addNewNote();
                    }else if(previousId){
                        openNote(previousId);                
                    }else{                   
                        openNote(sidebarDivs[0].getAttribute("data-id"));
                    }
                    Swal.fire('Deleted!', currentNote.title + " has been deleted!", 'success' );
                })
            }else if(result.dismiss === Swal.DismissReason.cancel){
                Swal.fire( 'Cancelled', currentNote.title + " has not been deleted.", 'error' );
            }
        })  
    }

//#endregion

//***************************************************************************************
//* Drop And Import Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function addMultipleEvents(el, eventArray, callback){
        eventArray.forEach(function(evt){
            el.addEventListener(evt, callback, false);
        });
    }

    /**************************************************************************************/
    function addDragAndDrop(){
        var elem = document.body; //  document.querySelector(".dropbox");
        addMultipleEvents(elem,  ["drag", "dragstart", "dragend", "dragover", "dragenter", "dragleave", "drop"], function(e){
            if(!(typeof e.target !== "undefined" && typeof e.target.classList !== "undefined" && e.target.classList.contains("item-div"))){
                e.preventDefault();
                e.stopPropagation();
            }
        });

        addMultipleEvents(elem,  ["dragover", "dragenter"], function(e){
            var dropBox = document.querySelector(".dropbox-container");
            if(dropBox) dropBox.classList.add('is-dragover');
        });

        addMultipleEvents(elem,  ["dragleave", "dragend"], function(e){ // "drop"
            var dropBox = document.querySelector(".dropbox-container");
            if(dropBox) dropBox.classList.remove('is-dragover');
        });

        elem.addEventListener("drop", function(e){
            var files = e.dataTransfer.files;
            if(files.length > 0){
                var file = files[0];
                var ext = file.name.split(".").pop().toLowerCase();
                if(ext == "zip"){
                    var dropBox = document.querySelector(".dropbox-container");
                    if(dropBox) dropBox.classList.add("is-uploading");
                    importData(file);
                } 
            }
        });
    }

    /**************************************************************************************/
    function importAsset(e){
        var input = e.srcElement;
        var ext = input.value.split(".").pop().toLowerCase();
        if(input.files.length > 0){
            if(ext == "zip") importData(input.files[0]); 
        }
    }

    /**************************************************************************************/
    function importData(file){ // file.type
        var zip = new JSZip();
        zip.loadAsync(file).then(function(zipContents){
            var entries = Object.keys(zip.files).map(function(name){ // https://github.com/Stuk/jszip/issues/375
                return zip.files[name];
            });
            var files = [];
            for(i in entries){
                if(entries[i].dir == false) files.push(entries[i]);
            }
            var listOfPromises = files.map(function(file){
                var parts = file.name.split("/");
                var dirName = parts[0];
                var fileName = parts[1];
                var asyncMethod = "string";
                if(dirName != fileName) asyncMethod = "base64"; // it was an attachment.           
                return file.async(asyncMethod).then(function(content){
                    return [asyncMethod, dirName, fileName, content];
                });
            });

            Promise.all(listOfPromises).then(function(list){
                var docs = [];
                // First add all the docs to the array. 
                for(var i = 0; i < list.length; i++){
                    var type = list[i][0];
                    var docName = list[i][1];
                    var data = list[i][3];
                    if(type == "string"){
                        docs.push({
                            _id: docName,
                            docContent: JSON.parse(data)
                        });
                    }
                }

                // Next go though and add all the attachments to thier documents.
                for(var i = 0; i < list.length; i++){
                    var type = list[i][0];
                    var docName = list[i][1];
                    var fileName = list[i][2];
                    var data = list[i][3];
                    if(type == "base64"){
                        for(var j = 0; j < docs.length; j++){ // Find the doc that the attachment belongs to. 
                            if(docs[j]._id == docName){
                                if(typeof docs[j]._attachments === "undefined") docs[j]._attachments = {};
                                docs[j]._attachments[fileName] = {
                                    "content_type": guessImageMime(data),
                                    "data": data
                                }  
                                break;
                            }
                        }
                    }                
                }

                dbDelete(db).then(function(){
                    db = getDB(dbName);
                    return dbBulkCreateDoc(db, docs);
                }).then(function(){
                    return dbGetDoc(db, "Config", defaultConfig)
                }).then(function(response){
                    config = typeof response._rev === "undefined" ? response : response.docContent;
                    config.sidebarOpened ? document.body.classList.add("sidebar-open") : document.body.classList.remove("sidebar-open");
                    openNote(config.lastOpened);
                    return loadNotesIntoSidebar(); 
                }).then(function(){
                    Swal.close();
                })
            });                
        });
    }

    /**************************************************************************************/
    function sunEditorClosed(){
        return typeof editor === "undefined" || typeof editor.core === "undefined";
    }

    /**************************************************************************************/
    function guessImageMime(data){ // https://gist.github.com/nazoking/2822127
        switch(data.charAt(0)){    // https://stackoverflow.com/questions/57976898/how-to-get-mime-type-from-base-64-string
            case '/':
                return "image/jpeg";
            case 'R':
                return "image/gif";
            case 'i':
                return "image/png";
        }
    }

//#endregion

//***************************************************************************************
//*  Note Editor Functions
//#region ******************************************************************************/

    /**************************************************************************************/
    function createEditor(){
        createHTMLTemplates();
        editor = SUNEDITOR.create('sunEditor', {
           // value: notesContent,      
            placeholder: "Notes for this calendar...",
            // imageGalleryUrl:  "backgrounds/info.json", 
            buttonList: [
                ['undo', 'redo'],
                ['font', 'fontSize', 'formatBlock'],
                ['paragraphStyle', 'blockquote'],
                ['bold', 'underline', 'italic', 'strike', 'subscript', 'superscript'],
                ['fontColor', 'hiliteColor', 'textStyle'],
                ['removeFormat'],
                ['outdent', 'indent'],
                ['align', 'horizontalRule', 'list', 'lineHeight'],
                ['table', 'link', 'image', 'video', 'audio'], 
                //['imageGallery'], 
                ['-right',  'fullScreen', 'template', 'save'],
                ['-right', ':i-More Misc-default.more_vertical', 'showBlocks', 'codeView', 'preview', 'print'],

                ['%1855', [
                        ['undo', 'redo'],
                        [':p-More Paragraph-default.more_paragraph', 'font', 'fontSize', 'formatBlock', 'paragraphStyle', 'blockquote'],
                        ['bold', 'underline', 'italic', 'strike'],
                        [':t-More Text-default.more_text', 'subscript', 'superscript', 'fontColor', 'hiliteColor', 'textStyle'],
                        ['removeFormat'],
                        ['outdent', 'indent'],
                        ['align', 'horizontalRule', 'list', 'lineHeight'],
                        ['-right', 'save'],
                        ['-right', ':i-More Misc-default.more_vertical', 'fullScreen', 'showBlocks', 'codeView', 'preview', 'print', 'template'],
                        ['-right', ':r-More Rich-default.more_plus', 'table', 'link', 'image', 'video', 'audio'] //, 'imageGallery']
                    ]
                ],

                ['%975', [
                    ['undo', 'redo'],
                    [':p-More Paragraph-default.more_paragraph', 'font', 'fontSize', 'formatBlock', 'paragraphStyle', 'blockquote'],
                    [':t-More Text-default.more_text', 'bold', 'underline', 'italic', 'strike', 'subscript', 'superscript', 'fontColor', 'hiliteColor', 'textStyle'],
                    ['removeFormat'],    
                    ['outdent', 'indent'],
                    [':e-More Line-default.more_horizontal', 'align', 'horizontalRule', 'list', 'lineHeight'],

                    ['-right', 'save'],
                    ['-right', ':i-More Misc-default.more_vertical', 'fullScreen', 'showBlocks', 'codeView', 'preview', 'print', 'template'],
                    [':r-More Rich-default.more_plus', 'table', 'link', 'image', 'video', 'audio'] //, 'imageGallery']
                ]],

                ['%655', [
                    ['undo', 'redo'],
                    [':p-More Paragraph-default.more_paragraph', 'font', 'fontSize', 'formatBlock', 'paragraphStyle', 'blockquote'],
                    [':t-More Text-default.more_text', 'bold', 'underline', 'italic', 'strike', 'subscript', 'superscript', 'fontColor', 'hiliteColor', 'textStyle', 'removeFormat'],
                    [':e-More Line-default.more_horizontal', 'outdent', 'indent', 'align', 'horizontalRule', 'list', 'lineHeight'],
                    ['-right', 'save'],
                    ['-right', ':i-More Misc-default.more_vertical', 'fullScreen', 'showBlocks', 'codeView', 'preview', 'print', 'template']
                    [':r-More Rich-default.more_plus', 'table', 'link', 'image', 'video', 'audio', 'math'] //, 'imageGallery'],
                ]]
            ],
            width: '100%',
            charCounter: true,  
            charCounterLabel: "Characters:",
            templates: [
                {
                    name: 'Calendar Year Tables',
                    html: yearTemplate
                },
                {
                    name: 'Current Month Table',
                    html: currentMonthTemplate
                }
            ],      
            callBackSave: saveEditorContents
        });    
    }

    /**************************************************************************************/
    function saveEditorContents(){
        var attachmentsArray = {};
        var contents = editor.getContents(true)
        var images = editor.getImagesInfo();
        images.forEach(function(img, i){
            var isBase64 = img.src.match(/^data:.*;base64,/) != null;
            if(isBase64){
                var type = img.src.split(";")[0].split(":")[1];
                // could use regex to check if valid. /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/
                // https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
                var base64 = img.src.split(",")[1]; //.replace("==", "");   

                // Prefix the attachment name with i_ to allow for multiple attachments with the same name.
                // If the same image is in the note twice it will save the image with two diffrent names, but under the hood pouchDB will only store the image data once.
                var attachmentName = i + "_" + img.name;
                attachmentsArray[attachmentName] = {
                    "content_type": type,
                    "data": base64
                }    
                contents = contents.replace(img.src, "{{" + attachmentName + "}}");  
            }
        })

        currentNote.notes = contents;
        saveCurrentNote().then(function(){
          dbBulkPutAttachments(db, currentId, attachmentsArray, true)
        })
    }

    /**************************************************************************************/
    function createHTMLTemplates(){
        yearTemplate = "";
        currentMonthTemplate = "";
        var monthTables = [];
        var now = new Date();
        var currentMonth = now.getMonth();
        var currentYear = now.getFullYear();
        var date = new Date(currentYear, 0, 1);
        while(date.getFullYear() == currentYear){ // Get a table for each month 
            monthTables.push(getMonthTableHTML(date));
        }

        // Create a template for the days of the year. 
        for(var i in monthTables){
            yearTemplate += monthTables[i];
            yearTemplate += "<p><br></p>";
        }

        currentMonthTemplate = monthTables[currentMonth]; // Template for just this month. 
    }

    /**************************************************************************************/
    function getMonthTableHTML(date){
        var mon = date.getMonth();
        var tableHTML =
        '<table class="se-table-size-auto">\
            <thead>\
                <tr>\
                <td colspan="7" rowspan="1">\
                    <div><div style="text-align: center;">';
        tableHTML += monthNames[mon];
        tableHTML +=
                    '</div></div>\
                </td>\
            </tr>\
        </thead>';
        tableHTML+= 
        "<tbody>\
            <tr>\
                <td><div>Sunday</div></td>\
                <td><div>Monday</div></td>\
                <td><div>Tuesday</div></td>\
                <td><div>Wednesday</div></td>\
                <td><div>Thursday</div></td>\
                <td><div>Friday</div></td>\
                <td><div>Saturday</div></td>\
            </tr>";

        var cellCount = 0; 
        while(mon == date.getMonth()){
            cellCount %= 7;
            if(cellCount == 0) tableHTML+= "<tr>";

            if(cellCount != date.getDay()){
                tableHTML += "<td><div><br></div></td>";
            }else{
                tableHTML += "<td><div>" + date.getDate() + "</div> <div><br></div>";
                date.setDate(date.getDate() + 1);
            }
            if(cellCount % 7 == 6) tableHTML+= "</tr>";
            cellCount++;
        }

        while(cellCount % 7 !=  0){
            tableHTML += "<td><div><br></div></td>";
            if(cellCount % 7 == 6) tableHTML+= "</tr>";
            cellCount++;
        }

        tableHTML += "</tbody></table>";
        return tableHTML;
    }

//#endregion

NodeList.prototype.forEach = Array.prototype.forEach;
