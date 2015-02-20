'use strict';

var error_page = require('../page_builders/error_page'),
	formidable = require('formidable'),
	submission_dao = require('../dao/submission_dao'),
	language_dao = require('../dao/language_dao'),
	owl_router = require('../lang_subsystems/owl_router'),
	fs = require('fs');

function route(response, request, compData, problemData, remainingPath) {
	console.log('judge:: Routing request for submission from user ' + request.session.data.user.user_name + ', problem ' + problemData.name);

	if (remainingPath && remainingPath != '') {
		console.log('Error - non-empty remaining path, ' + remainingPath);
		error_page.ShowErrorPage(response, request, 'Security Error', 'A path that should not be reached has been reached. Access denied.');
	} else {
		judge_submission(response, request, compData, problemData);
	}
}

function judge_submission(response, request, compData, problemData) {
	console.log('judge: Preparing to judge submission...');

	var form = new formidable.IncomingForm(),
		newPath, oldPath, original_filename,
		submissionID;
	form.parse(request, function (error, fields, files) {
		if (error) {
			console.log('Error parsing form: ' + error);
			error_page.ShowErrorPage(response, request, 'Internal Error', 'An internal error occurred - try submitting again, ask admin to consult logs.');
		} else {
			oldPath = files.submission_file.path;
			original_filename = files.submission_file.name;
			
			// (1) Record submission data to SQL
			submission_dao.reportSubmissionReceived(fields.language,
				problemData.id, request.session.data.user.id, Date.now(),
				function (submission_id, error) {
					if (error) {
						console.log('judge: ERR SQL Error reporting received submission: ' + error);
						error_page.ShowErrorPage(response, request, 'SQL Error', 'Error reporting submission received. Check logs!');
					} else {
						// (2) Receive submission, move files to staging area
						newPath = './data/submits/s' + submission_id;
						moveFile(oldPath, newPath, afterFileMoved);
						submissionID = submission_id;
					}
				}
			);
		}

		// (3) Show submission page to user, setup socket
		function afterFileMoved(error) {
			if (error) {
				console.log('Error moving file: ' + error);
				error_page.ShowErrorPage(response, request, 'Internal Error', 'Unable to move submission to judge environment. Check logs.');
			} else {
				// (3) Show submission page to user (RESPONSE)
				//  (a) Setup socket (server-side)
				response.writeHead(303, {'Location': '/competition/c' + compData.id + '/p' + problemData.id + '/submissions'});
				response.end();

				// (4) Begin judge process
				beginJudgeProcess(submissionID, problemData, fields.language, newPath, original_filename, recordResult);
			}
		}
	});

	// (5) Record judgement result
	function recordResult(resultData, error) {
		console.log('judge: Result is to be recorded here.');
		console.log(resultData);
		// (6) Broadcast message via socket
		// TODO KIP: Broadcast this message
	}
}

// Callback: err (null if success)
function moveFile(oldPath, newPath, callback) {
	console.log('judge: Moving submission from ' + oldPath + ' to ' + newPath);
	fs.rename(oldPath, newPath, function (err) {
		if (err) {
			fs.unlink(newPath);
			fs.rename(oldPath, newPath, function (aerr) {
				if (aerr) {
					console.log('judge: Unable to move submission: ' + aerr);
					callback(aerr);
				} else {
					callback();
				}
			});
		} else {
			callback();
		}
	});
}

// Callback:
//  - result: { result: 'AC'/'TLE'/'WA'..., source_code: ... notes: ... }
//  - error: some error description
function beginJudgeProcess(submissionID, problemData, langID, path, originalFilename, callback) {
	console.log('judge: Beginning judge process for submission ' + submissionID);

	language_dao.getLanguageData(langID, function (result, err) {
		if (err) {
			console.log('judge: ERR SQL error retrieving language data: ' + err);
			callback(null, 'Error retrieving language data.');
		} else {
			// We know which system to use - route to subsystem
			routeToJudgementSubsystem(result);
		}
	});

	function routeToJudgementSubsystem(languageData) {
		// Determine if a subsystem exists to achieve that goal
		//  If so, route to that subsystem.
		//  If not, give an error to the user.
		owl_router.judgeSubmission(submissionID, languageData,
			problemData, path, originalFilename, function (res, notes, err) {
				if (err) {
					callback(null, 'judge: ERR judging submission: ' + err);
				} else {
					recordResults(res, notes);
				}
			}
		);
	}

	// Callback for test: do the callback described above.
	function recordResults(result, notes) {
		submission_dao.reportSubmissionResult(submissionID, result, notes, function (error) {
			if (error) {
				callback(null, 'judge: ERR recording results: ' + err);
			} else {
				callback({
					result: result,
					notes: notes
				});
			}
		});
	}
}

/*
function judge_submission(response, request) {
	console.log('Submission received!!! :D :D :D');

	var subDesc, subData;
	// Get submission description

	var form = new formidable.IncomingForm();
	console.log('Parsing form...');
	form.parse(request, function(error, fields, files) {
		console.log('Apparently, parsing is finished');
		if (error) {
			console.log('Error: ' + error);
			response.writeHead(200, {'Content-Type': 'text/plain'});
			response.write('Failed to parse incoming form - ' + error);
			response.end();
			return;
		} else if (!request.session.data.userData.submitting_for) {
			console.log('Error - submitting_for variable did not reach judge_submission (requestHandlers.js)');
			response.writeHead(200, {'Content-Type': 'text/plain'});
			response.write('Backend error - please notify developers (and check log)');
			response.end();
			return;
		}

		// Add on the selected language to the submission description...
		request.session.data.userData.submitting_for.lang_id = fields.language;

		// We have our submission data...
		judge.CreateSubmissionJudgePage(
			request.session.data.userData, // userData
			request.session.data.userData.submitting_for, // subDesc
			files.submissionfile.path, // subData
			files.submissionfile.name, // fileName
			function(page, err) { // callback
				if (err) {
					console.log('Error in starting judge process - ' + err);
					response.writeHead(200, {'Content-Type': 'text/plain'});
					response.write('Could not start judge process - ' + err);
					response.end();
				} else {
					page.render(function(contents, err) {
						if (err) {
							console.log('Error in rendering judge page - ' + err);
							response.writeHead(200, {'Content-Type': 'text/plain'});
							response.write('Could not render judge process page - ' + err);
							response.end();
						} else {
							console.log('Writing rendered judge page');
							response.writeHead(200, {'Content-Type': 'text/html'});
							response.write(contents);
							response.end();
						}
					});
				}
			}
		);
	});
}
*/

exports.route = route;