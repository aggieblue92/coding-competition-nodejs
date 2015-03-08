'use strict';

var generic_page = require('../page_builders/generic_page'),
	submission_dao = require('../dao/submission_dao'),
	competition_page = require('../page_builders/competition_page'),
	error_page = require('../page_builders/error_page'),
	result_listener_socket = require('../sockets/result_listener_socket'),
	results_key = {
		'AC': 'Correct',
		'WA': 'Wrong Answer',
		'TLE': 'Time Limit Exceeded',
		'RE': 'Runtime Error',
		'IE': 'Internal Server Error<br /><i>(You will not be docked)</i>',
		'BE': 'Build Error<br /><i>(You will not be docked)</i>',
		'Q': 'Judging...'
	};

exports.route = function(response, request, compData, problemData, remainingPath) {
	// TODO KIP: What if there is just a '/' ? Change that everywhere!
	if (remainingPath === undefined || remainingPath === '' || remainingPath === '/') {
		showSubmissionPage(response, request, compData, problemData, 0);
	} else if(/\/\d+/.test(remainingPath)) {
		showSubmissionPage(response, request, compData, problemData, (/\/\d+/.exec(remainingPath)).toString().substr(1));
	} else {
		console.log('submission_page: Routing request to view submissions');
		response.writeHead('200', {'Content-Type': 'text/plain'});
		response.write('You\'ve reached the submission page!');
		response.write('Remaining path: ' + remainingPath);
		response.end();
	}
}

function showSubmissionPage(response, request, compData, problemData, page_num) {
	console.log('Showing submission page for problem ' + problemData.name);

	var submission_page = generic_page.GoronPage({
		title: '(Goron) Results for problem ' + problemData.name,
		body: submissionPageBody(compData.id, problemData, +page_num),
		header: generic_page.GoronHeader({
				title: 'Results for problem ' + problemData.name,
				subtitle: 'USU ACM Competition ' + compData.name,
				user_info: competition_page.GoronCompetitionUserInfo(request.session.data.user, compData)
			}),
		sidebar: competition_page.GoronCompetitionSidebar(request.session.data.user, compData)
	});

	if (!submission_page) {
		error_page.ShowErrorPage(response, request, 'Could not generate page', 'An unknown error occurred, and the submission page you were trying to view could not be generated.');
	} else {
		submission_page.render(function (content, err) {
			if (err !== undefined) {
				error_page.ShowErrorPage(response, request, 'Could not render page', 'The requested page could not be rendered - ' + err);
			} else {
				response.writeHead(200, {'Content-Type': 'text/html'});
				response.write(content);
				response.end();
			}
		});
	}
}

function submissionPageBody(compID, problemData, page_num) {

	var start = page_num * 25,
		finish = (page_num + 1) * 25;

	function gen_dependencies(callback) {
		result_listener_socket.requestResultListener(problemData);
		callback([{ type: 'js', href: 'https://cdn.socket.io/socket.io-1.2.0.js' },
			{ type: 'js', href: 'http://code.jquery.com/ui/1.11.3/jquery-ui.js' }]);
	}

	// NEXT VERSION: Use static scripts, yo. This is miserable.
	function gen_scripts(callback) {
		// TODO FRONTEND: This is also where you would put a flash on submission received and
		//  all that front-end jazz.
		var listener_script =
			  'var res_listener = io(\'/PR' + problemData.id + '\'),'
			  + '\n\ttrs = io(\'/CT' + compID + '\')'
			  + '\n\tresults_key = {'

		for (var key in results_key) {
			listener_script += '\n\t\t\'' + key + '\': \'' + results_key[key] + '\',';
		}
		listener_script = listener_script.substring(0, listener_script.length - 1);
		listener_script += '\n\t};'
			+ '\nres_listener.on(\'submission_finished\', function (res) {'
				+ '\n\tconsole.log(\'Received submission \' + res.id + \' with result: \' + res.result + \' and notes: \' + res.notes);'
				+ '\n\$(\'#td_res_\' + res.id).html(results_key[res.result]);'
				+ '\n\$(\'#td_res_\' + res.id).click(function() { \$(\'<div />\').html(res.notes).dialog({ modal: true, buttons: { Ok: function () { $(this).dialog("close"); }} }); });'
				+ '\n\$(\'#td_notes_\' + res.id + \'_p\').text(res.notes);'
				+ '\n\tconsole.log(JSON.stringify(res));'
			+ '\n});'
			+ '\ntrs.on(\'time_remaining\', function(tr) {'
				+ '\n\tconsole.log(\'Time remaining event fired, with param: \' + tr);'
				+ '\n\tvar ctr_f = $(\'#ctr\');'
				+ '\n\tif (tr > 0) {'
				+ '\n\t\ttr = Math.floor(tr / 1000);'
				+ '\n\t\tvar secs = tr % 60,'
				+ '\n\t\t\tmins = Math.floor(tr / 60) % 60,'
				+ '\n\t\t\thrs = Math.floor(tr / 360) % 24,'
				+ '\n\t\t\tsecs_txt = (\'00\' + secs).slice(-2),'
				+ '\n\t\t\tmins_txt = (\'00\' + mins).slice(-2),'
				+ '\n\t\t\thrs_txt = (\'00\' + hrs).slice(-2);'
				+ '\n\t\tctr_f.text(\'Time remaining: \' + hrs_txt + \':\' + mins_txt + \':\' + secs_txt);'
				+ '\n\t} else {'
				+ '\n\t\tctr_f.text(\'<b>Time is up!</b>\');'
				+ '\n\t}'
			+ '\n});'
			+ '\nfunction showModal(sub_id) {'
			+ '\n\tconsole.log(sub_id);'
			+ '\n\tconsole.log($("#td_notes_" + sub_id));'
			+ '\n\t$(function() { $("#td_notes_" + sub_id).dialog({ modal: true, buttons: { Ok: function () { $(this).dialog("close"); }} }); });'
			+ '\n}';
		callback(listener_script);
	}

	function render(callback) {
		var body_text = '<div id="content" class="col-md-10">\n<table class="table table-hover">'
			+ '\n\t<tr class="table_header">'
			+ '\n\t\t<th>ID</th><th>Team</th><th>Language</th><th>Date&frasl;Time</th><th>Result</th>';
			+ '\n\t</tr>';

		// Get submissions...
		submission_dao.getProblemSubmissions(problemData.id, start, finish, function (res, err) {
			if (err) {
				console.log('submission_page: Error retrieving submissions: ' + err);
				body_text += '</table><p>Could not retrieve submissions table - check logs for error</p>';
				finish_rendering();
			} else {
				render_table(res);
			}
		});

		function render_table(results) {
			for (var i = 0; i < results.length; i++) {

				body_text += '\n\t<tr id="tr_sub_' + results[i].submission_id + '"';

				if (results[i].result === 'AC') {
					body_text += ' class="success" ';
				} else if (results[i].result === 'WA' || results[i].result === 'TLE' || results[i].result === 'WA' || results[i].result === 'RE') {
					body_text += ' class="warning" ';
				}

				body_text += '>'
					+ '\n\t\t<td>' + results[i].submission_id + '</td>'
					+ '\n\t\t<td>' + results[i].user_name + '<br /><i>' + results[i].user_tagline + '</i></td>'
					+ '\n\t\t<td>' + results[i].lang_name + '</td>'
					+ '\n\t\t<td>' + formatDate(new Date(results[i].submission_time)) + '</td>'
					+ '\n\t\t<td>'
						+ '<button class="btn btn-default btn-mini" id="td_res_' + results[i].submission_id + '" onclick="showModal(' + results[i].submission_id + ');">' + results_key[results[i].result] + '</a>'
						+ '<div style="display: none;" id="td_notes_' + results[i].submission_id + '" title="Notes for submission ' + results[i].submission_id + '">'
						+ '<p id="td_notes_' + results[i].submission_id + '_p">' + results[i].notes + '</p></div></td>'
					+ '\n\t</tr>';
			}
			body_text += '\n</table>\n</div>';
			finish_rendering();
		}

		function finish_rendering() {
			if (page_num > 1) {
				body_text += '\n<a href="/competition/c' + problemData.comp_id + '/p' + problemData.id + '/submissions/' + (+page_num - 1)
					+ '">Previous Page</a><br />';
			} else if (page_num == 1) {
				body_text += '\n<a href="/competition/c' + problemData.comp_id + '/p' + problemData.id + '/submissions'
					+ '">Previous Page</a><br />';
			}
			body_text += '\n<a href="/competition/c' + problemData.comp_id + '/p' + problemData.id + '/submissions/' + (+page_num + 1)
				+ '">Next Page</a>';
			callback(body_text);
		}
	}

	return {
		render: render,
		gen_dependencies: gen_dependencies,
		gen_scripts: gen_scripts
	};
}

function formatDate(date) {
	var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
	return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear() + ' '
		+ ('00' + ((date.getHours() % 12) + 1)).substr(-2) + ':'
		+ ('00' + date.getMinutes()).substr(-2) + ':'
		+ ('00' + date.getSeconds()).substr(-2)
		+ (date.getHours() >= 12 ? ' PM' : ' AM');
}