/*! pybossa.js library

Copyright (C) 2015 SciFabric LTD.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

(function(pybossa, $, undefined) {
    let URL = '/';
    let _userId;
    let _observer;

    //AJAX calls
    function _userProgress(projectname) {
        return $.ajax({
            url: URL + 'api/project/' + projectname + '/userprogress',
            cache: false,
            dataType: 'json'
        });
    }

    function _fetchProject(projectname) {
        return $.ajax({
            url: URL + 'api/project',
            data: 'all=1&short_name='+projectname,
            dataType:'json'
        });
    }

    function _newTaskUrl(projectId, taskId) {
        let seg;
        if (window.pybossa.isGoldMode) {
            seg = '/taskgold';
        } else if (taskId) {
            seg = '/newtask/' + taskId;
        } else {
            seg = '/newtask';
        }
        return URL + 'api/project/' + projectId + seg;
    }

    function _fetchNewTask(projectId, offset, taskId) {
        offset = offset || 0;
        return $.ajax({
            url: _newTaskUrl(projectId, taskId),
            data: 'offset=' + offset,
            cache: false,
            dataType: 'json'
        });
    }

    function _fetchTask(taskId) {
        return $.ajax({
            url: URL + 'api/task/' + taskId,
            cache: false,
            dataType: 'json'
        });
    }

    function _deleteRequest(url, data=null) {
        return $.ajax({
            type: 'DELETE',
            url: url,
            dataType: 'json',
            contentType: 'application/json',
            data: data
        })
    }

    function _getRequest(url) {
        return $.ajax({
            url: url,
            cache: false,
            dataType: 'json',
            contentType: 'application/json',
        })
    }

    function _postRequest(url, data){
        return $.ajax({
            type: 'POST',
            url: url,
            dataType: 'json',
            contentType: 'application/json',
            data: data
        });
    }

    function _postRequestAsForm(url, data){
        return $.ajax({
            type: 'POST',
            url: url,
            contentType: false,
            processData: false,
            data: data
        });
    }

    function _putRequest(url, data){
        return $.ajax({
            type: 'PUT',
            url: url,
            dataType: 'json',
            contentType: 'application/json',
            data: data
        });
    }

    function _putRequestAsForm(url, data){
        return $.ajax({
            type: 'PUT',
            url: url,
            contentType: false,
            processData: false,
            data: data
        });
    }

    function _saveTaskRun(taskrun, projectId, containsFiles ) {
        var requestUrl = URL + 'api/taskrun';
        if(window.pybossa.isGoldMode){
            requestUrl = URL + 'api/project/' + projectId + '/taskgold';
        }
        if (window.pybossa.editSubmission){
            requestUrl = requestUrl + "/" + window.pybossa.taskrunId;
            return containsFiles ? _putRequestAsForm(requestUrl, taskrun) : _putRequest(requestUrl, taskrun);
        }
        return containsFiles ? _postRequestAsForm(requestUrl, taskrun) : _postRequest(requestUrl, taskrun);
    }

    function _cancelTask(projectname, taskId) {
        var data = {
            'projectname': projectname
        };
        return $.ajax({
            type: 'POST',
            url: URL + 'api/task/' + taskId + '/canceltask',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(data)
        });
    }

    function _releaseCategoryLocks(projectname, taskId) {
        var data = {
            'projectname': projectname
        };
        return $.ajax({
            type: 'POST',
            url: URL + 'api/task/' + taskId + '/release_category_locks',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(data)
        });
    }

    function _fetchLock(taskId) {
        return $.ajax({
            url: URL + 'api/task/' + taskId + '/lock',
            cache: false,
            dataType: 'json'
        });
    }

    // Private methods
    function _getProject(projectname){
        return _fetchProject(projectname)
        .then(function(data) {return data[0];});
    }

    function _getNewTask(project) {
        return _fetchNewTask(project.id)
        .then(_addProjectDescription.bind(undefined, project));
    }

    function _addProjectDescription(project, task) {
        return { question: project.description, task: task};
        }

    function _addAnswerToTask(task, answer) {
        task.answer = answer;
        return task;
    }

    function getFieldFiles(answer){
        var fieldNames = [];
        if (typeof(answer) === 'object'){
            for(var key in answer){
                if (answer[key] && answer[key].file instanceof File) {
                    fieldNames.push(key);
                }
            }
        }
        return fieldNames;
    }

    function getFormDataWithFiles(info, answer, fieldFiles){
        var taskrun = new FormData();
        for(var i in fieldFiles){
            var fileData= answer[fieldFiles[i]]
            taskrun.append(fieldFiles[i], fileData.file, fileData.name);
        }
        taskrun.append('request_json', JSON.stringify(info))
        return taskrun;
    }

    function _createTaskRun(answer, task) {
        task = _addAnswerToTask(task, answer);
        var taskrun = {
            'project_id': task.project_id,
            'task_id': task.id,
            'info': task.answer
        };

        var fieldFiles = getFieldFiles(answer);

        var containFiles = fieldFiles.length > 0;
        taskrun = containFiles ? getFormDataWithFiles(taskrun, answer, fieldFiles) : JSON.stringify(taskrun);

        return _saveTaskRun(taskrun, task.project_id, containFiles).then(function(data) {
            if(window.pybossa.isGoldMode && !window.pybossa.isBulk){
                setTimeout(function(){
                    window.opener.location.reload(true);
                    window.top.close();
                }, 100);
            }

            return data;});
    }

    function _getCurrentTaskId(pathname) {
        const pathArray = pathname.split('/');
        if (pathname.indexOf('/task/') != -1) {
            for (let i = 0; i < pathArray.length; i++) {
                if (pathArray[i] == 'task') {
                    return pathArray[i + 1];
                }
            }
        }
        return false;
    }

    // fallback for user defined action
    var _taskLoaded = function(task, deferred) {
        deferred.resolve(task);
    };

    var _presentTask = function(task, deferred) {
        deferred.resolve(task);
    };

    function _setUserTaskLoaded (userFunc) {
        _taskLoaded = userFunc;
    }

    function _setUserPresentTask (userFunc) {
        _presentTask = userFunc;
    }

    //This func determine if the worker is in quiz mode and is not the first question of the quiz, and ensure there are questions available.
    function _inQuizMode (userProgress, quiz, config){
        if (quiz && config.enabled && quiz.status === 'in_progress' && ((quiz.result.right > 0 || quiz.result.wrong > 0)
            && userProgress.remaining_for_user > 0)){
            window.pybossa.takingQuiz = true;
            return { msg: 'In quiz mode', type: 'info' };
        }
    }

    //This func determine if worker is in quiz mode and is the first question of the quiz, and ensure there are questions availables
    function _quizStarted (userProgress, quiz, config){
        if(!window.pybossa.takingQuiz && !window.pybossa.passedQuizShowed && quiz && config.enabled && quiz.status === 'in_progress' &&
            userProgress.remaining_for_user > 0 && (quiz.result.right === 0 && quiz.result.wrong === 0)){

            //This flag is to determine when to show the passedQuizNotification
            window.pybossa.passedQuizShowed = true;
            return { msg: 'You must complete a quiz successfully before you can work on this job. You are in Quiz mode.',
                     type: 'info' }
        }
    }

    // This func determine if there are no more questions available for the quiz.
    function _outOfGoldenTasks (quiz, config, isEmptyTask){
        if (quiz && config.enabled && isEmptyTask && quiz.status === 'in_progress' && !window.pybossa.isGoldMode){
            return { msg: 'We have run out of quiz questions for you. Please notify the project owner.',
                     type: 'info' }
        }
    }

    //This func is to determine if in Bulk gold mode are more task available to be converted into gold
    function _outOfNonGoldTask (isEmptyTask){
        if (isEmptyTask && window.pybossa.isBulk){
            return { msg:'In gold mode, there are no tasks available.',
                     type: 'warning' };
        }
    }

    //This func determine if the quiz is failed and the user is not able to work on the project
    function _failedQuiz (quiz, config){
        if (quiz && config.enabled && quiz.status === 'failed'){
            return { msg: 'Thank you for taking the quiz. You got ' + quiz.result.right + ' correct out of ' + quiz.config.questions +' tasks. ' +
                            'You have been blocked from working on this job. The administrator of this job will contact you with next steps.',
                     type: 'error' };
        }
    }

    // This func determine if the user passed the quiz and use two flags to decide to show or not the notification since we only want to show it once
    function _passedQuiz (quiz, config){
        if (quiz && config.enabled && quiz.status === 'passed' && (window.pybossa.passedQuizShowed || window.pybossa.takingQuiz)){
            window.pybossa.passedQuizShowed = false;
            window.pybossa.takingQuiz = false;
            return { msg: 'Thank you for taking the quiz. You got ' + quiz.result.right + ' correct out of ' + quiz.config.questions + ' tasks. ' +
                           'You are now working on this job.',
                     type: 'warning' };
        }
    }

    //This func determine if the project is completed and redirects to project home if it is.
    function _projectCompleted (userProgress, quiz, isEmptyTask, projectName){
        if (isEmptyTask || quiz && userProgress.remaining_for_user === 0 && quiz.status !== 'in_progress'){
            // redirect
            window.location.href = window.location.origin + "/project/" + projectName + "?completed=true"
        }
        return false
    }

    //This func determine guidelines has been updated.
    function _guidelinesUpdated (userProgress){
        if (userProgress.guidelines_updated){
            pybossaNotify('Guidelines have been updated since your last submission.', true, 'warning', true);
        }
    }

    //This func determine if its in gold mode.
    function _inGoldMode (isEmptyTask){
        if (window.pybossa.isGoldMode && !isEmptyTask) {
            return { msg: 'In Gold Mode', type: 'warning' };
        }
    }

    //This func determine if its in read only mode.
    function _readOnly (){
        if (window.pybossa.isReadOnly ) {
            return { msg: "In read only mode, you can't submit.", type: 'warning' };
        }
    }

    //This func determine if its in edit submission mode.
    function _canEditSubmission (){
        if (window.pybossa.editSubmission ) {
            return { msg: "You are now editing this task.", type: 'warning' };
        }
    }

    function _isCherryPick (){
        return window.pybossa.isCherryPick;
    }

    function _getNotificationMessage(userProgress, isEmptyTask, projectName){
        var quiz = userProgress.quiz;
        var config = quiz.config;

        return _readOnly() || _outOfGoldenTasks(quiz, config, isEmptyTask) ||
               _outOfNonGoldTask(isEmptyTask) || _inGoldMode(isEmptyTask) ||
                                            // handles redirect on project completion
               _failedQuiz(quiz, config) || _projectCompleted(userProgress, quiz, isEmptyTask, projectName) ||
               _passedQuiz(quiz, config) || _quizStarted(userProgress, quiz, config) ||
               _inQuizMode(userProgress, quiz, config) || _canEditSubmission();
    }

    function _displayBanner(isEmptyTask){
        var regex = new RegExp('/project/([^/]+)');
        var match = window.location.href.match(regex);
        var projectName;
        if (match) {
            projectName = match[1];
        }

        _userProgress(projectName).then(data => {
            var quizMsg = _getNotificationMessage(data, isEmptyTask, projectName);
            if(quizMsg){
                pybossaNotify(quizMsg.msg, true, quizMsg.type);
            }
            _guidelinesUpdated(data);
            });
    }

    function _check_disable_submit_buttons() {
        // Disable the submit buttons if the task is read-only.
        var selector = 'button.submit-button,button.submit-last-button';

        // Setup callback handler for change to disabled state on buttons.
        function onDisabled(mutations) {
            // Check if the "disabled" attribute has changed to false (meaning the button is now active).
            mutations.forEach(function(mutation) {
                // Is the button no longer disabled?
                if (!mutation.target.disabled) {
                    // The button is active. Set the buttons back to disabled if the task is read-only.
                    var isReadOnly = _readOnly();
                    isReadOnly && document.querySelectorAll(selector).forEach(function(button) {
                        button.disabled = true;
                        button.setAttribute('title', isReadOnly.msg);
                    });
                }
            });

            // Cleanup the observer.
            _observer.disconnect();
        }

        // Cleanup any previous observer.
        _observer && _observer.disconnect();

        // Create an observer to notify when the disabled state has changed (task has fully loaded and presented to user).
        _observer = new MutationObserver(onDisabled);

        // Setup the observer to watch for changes to the disabled attribute on the buttons.
        document.querySelectorAll(selector).forEach(function(button) {
            _observer.observe(button, {
                attributes: true,
                attributeFilter: ['disabled']
            });
        });
    }

    function _resolveNextTaskLoaded(task, deferred) {
        var isEmptyTask = JSON.stringify(task) == '{}';
        _displayBanner(isEmptyTask);
        _check_disable_submit_buttons();
        var udef = $.Deferred();
        _taskLoaded(task, udef);
        udef.done(function(task) {
            deferred.resolve(task);
        });
    }

    function _run (projectname, _window) {
        _window = _window || window;
        _fetchProject(projectname).done(function(project) {
            project = project[0];
            function getNextTask(offset, previousTask) {
                offset = offset || 0;
                const def = $.Deferred();
                const taskId = _getCurrentTaskId(_window.location.pathname);
                if (!project) {
                    console.log("Warning: project seems undefined. Did you run in your project pybossa.run('projectname'); with the right name?");
                }
                let jqXHR;
                if (taskId && (previousTask === undefined) && !_isCherryPick()) { // Task Browse
                    jqXHR =  _fetchTask(taskId);
                } else if (taskId && _isCherryPick() && previousTask === undefined) {  // cherry pick from task list
                    jqXHR = _fetchNewTask(project.id, offset, taskId);
                } else if (window.pybossa.editSubmission) {
                    // with edit submission option, upon submit button clicked
                    // suppress loading of next task. this will also disable
                    // submit button avoiding multiple clicks
                    jqXHR =  null;
                } else {  // Non cherry pick mode or auto pick a task after click "submit" button
                    jqXHR = _fetchNewTask(project.id, offset);
                }

                if (jqXHR){
                    jqXHR.done(function(task) {
                        if (previousTask && task.id === previousTask.id) {
                            _fetchNewTask(project.id, offset+1)
                            .done(function(secondTask){
                                _resolveNextTaskLoaded(secondTask, def);
                            });
                        }
                        else {
                            _resolveNextTaskLoaded(task, def);
                        }
                    });
                }
                return def.promise();
            }

            function loop(task) {
                let taskSolved = $.Deferred(),
                    nextUrl;
                if (task.id) {
                    if (URL != '/') {
                        nextUrl = URL + '/project/' + projectname + '/task/' + task.id;
                    } else {
                        nextUrl = '/project/' + projectname + '/task/' + task.id;
                    }
                    history.pushState({}, "Title", nextUrl);
                }
                _presentTask(task, taskSolved);
                $.when(taskSolved).then(function() {
                    getNextTask(0, task).done(loop);
                });
            }
            getNextTask(0, undefined).done(loop);
        });
    }

    // Public methods
    pybossa.newTask = function (projectname) {
        return _getProject(projectname).then(_getNewTask);
    };

    pybossa.saveTask = function (taskId, answer) {
        if (typeof(taskId) === "number") {
            return _fetchTask(taskId).then(_createTaskRun.bind(undefined, answer));
        }
        if (typeof(taskId) === "object") {
            var task = taskId
            return _createTaskRun(answer, task);
        }
    };

    pybossa.getCurrentTaskId = function (pathname) {
        if (pathname !== undefined) {
            return _getCurrentTaskId(pathname);
        }
        else {
            return _getCurrentTaskId(window.location.pathname);
        }
    };

    pybossa.userProgress = function (projectname) {
        return _userProgress( projectname );
    };

    pybossa.run = function (projectname, _window) {
        return _run(projectname, _window);
    };

    pybossa.taskLoaded = function (userFunc) {
        return _setUserTaskLoaded( userFunc );
    };

    pybossa.presentTask = function (userFunc) {
        return _setUserPresentTask( userFunc );
    };

    pybossa.setEndpoint = function (endpoint) {
        // Check that the URL has the trailing slash, otherwise add it
        if ( endpoint.charAt(endpoint.length-1) != '/' ) {
            endpoint += '/';
        }
        URL = endpoint;
        return URL;
    };

    pybossa.cancelTask = function (projectname, taskId) {
        _cancelTask(projectname, taskId).done(function(){
            window.location.replace('/project/' + projectname);
        });
    };

    pybossa.fetchLock = function (taskId) {
        if (window.pybossa.isReadOnly || window.pybossa.editSubmission) {
            return $.Deferred().resolve(0);
        }
        return _fetchLock(taskId)
    };

    pybossa.setUserId = function (userId) {
        _userId = userId;
    };

    pybossa.getUserId = function () {
        return _userId;
    };

    pybossa.releaseCategoryLocks = function (projectname, taskId) {
        _releaseCategoryLocks(projectname, taskId).done(() => {
        });
    }

    var DB_NAME = 'Pybossa';
    var DB_VERSION = 1;
    var STORE_NAME = 'answers'

    function openDb (dbName, dbVersion) {
        if (!window.indexedDB) {
            console.warn('indexdDB not available. Cannot save partial answers');
            return;
        }
        return new Promise((resolve, reject) => {
            var req = window.indexedDB.open(dbName, dbVersion);
            req.onsuccess = evt => resolve(evt.target.result);
            req.onerror = reject;
            req.onupgradeneeded = (evt) => {
                evt.target.result.createObjectStore(STORE_NAME, {keyPath: 'taskId'});
            }
        });
    }

    let _db;

    function getKey(taskId) {
        return _userId + '-' + taskId;
    }

    function getDb () {
        if (_db === undefined) {
            return openDb(DB_NAME, DB_VERSION)
            .then(function(db) {
                _db = db;
                return _db;
            })
            .catch(function(err) {
                console.warn({ err });
            });
        }
        return Promise.resolve(_db);
    }

    function getStore (opts) {
        return getDb()
        .then(function(db) {
            if (!db) {
                return;
            }
            var transaction = db.transaction([STORE_NAME], opts.readOnly ? 'readonly' : 'readwrite');
            return transaction.objectStore(STORE_NAME);
        });
    }

    pybossa.savePartialAnswer = function (taskId, answer) {
        return getStore({ readOnly: false })
        .then(function(store) {
            if (!store) {
                return;
            }
            return new Promise((resolve, reject) => {
                var req = store.put({
                    taskId: getKey(taskId),
                    answer: answer,
                    savedAt: (new Date()).toISOString()
                });
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        })
    };

    pybossa.getSavedAnswer = function (taskId) {
        return getStore({ readOnly: true })
        .then(function(store) {
            if (!store) {
                return;
            }
            return new Promise((resolve, reject) => {
                var req = store.get(getKey(taskId));
                req.onsuccess = (evt) => {
                    resolve(evt.target.result) };
                req.onerror = reject;
            });
        })
    };

    pybossa.deleteSavedAnswer = function (taskId) {
        return getStore({ readOnly: false })
        .then(function(store) {
            if (!store) {
                return;
            }
            return new Promise((resolve, reject) => {
                var req = store.delete(getKey(taskId));
                req.onsuccess = resolve;
                req.onerror = reject;
            });
        })
    };

    pybossa.assignTaskToUser = function (projectName, taskId, unassgin=false) {
        const data = { 'projectname': projectName, 'unassgin': unassgin };
        const url = URL + 'api/task/' + taskId + '/assign';
        let ajaxResponse = _postRequest(url, JSON.stringify(data)).then(() => {
            if (!unassgin) {
                const sticky = true;
                const msg = 'The task has been saved and assigned to you.'
                pybossaNotify(msg, true, 'info', true, sticky);
            }
        });
        return ajaxResponse;
    };

    pybossa.savePartialAnswerToServer = function (taskId, data, projectName) {
        const url = `${URL}api/project/${projectName}/task/${taskId}/partial_answer`;
        let ajaxResponse = _postRequest(url, JSON.stringify(data));
        return ajaxResponse;
    }

    pybossa.getSavedAnswerFromServer = function (taskId, projectName) {
        const url = `${URL}api/project/${projectName}/task/${taskId}/partial_answer`;
        let ajaxResponse = _getRequest(url);
        return ajaxResponse;
    }

    pybossa.deleteSavedAnswerFromServer = function (taskId, projectName) {
        const url = `${URL}api/project/${projectName}/task/${taskId}/partial_answer`;
        let ajaxResponse = _deleteRequest(url);
        return ajaxResponse;
    };
} (window.pybossa = window.pybossa || {}, jQuery));
