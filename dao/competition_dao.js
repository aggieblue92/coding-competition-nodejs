'use strict';

var mysql = require('mysql'),
	credentials = require('./credentials');

var connection,
	active_query_count = 0;

function getConnection() {
	if (!connection) {
		connection = mysql.createConnection(credentials.getCredentials());
	}

	// NEXT VERSION: Unify getConnection functions, handle connection errors.
	return connection;
}

function reportQueryActive() {
	active_query_count++;
	console.log('user_dao query count: ' + active_query_count);
}

function reportQueryEnded() {
	active_query_count--;
	console.log('user_dao query count: ' + active_query_count);
	if (active_query_count == 0) {
		console.log('Closing connection user_dao...');
		connection.end();
		connection = undefined;
	}
}

// Callback format: compData, err
// compData:
// - id, name, is_private, start_date, end_date
// - problems:
// - - id, name, description_file_path
function getCompetitionData(compDesc, callback) {
	console.log('competition_dao: Retrieving competition data for:');
	console.log(compDesc);

	if (!compDesc) {
		console.log('No competition description provided. Selecting names, ids of all competitions...');
		var query = getConnection().query('SELECT id, name FROM Competition;');
		reportQueryActive();
		var competition_list = [];
		var error_generated = false;
		query.on('error', function(err) {
			error_generated = true;
			callback(null, 'SQL - Select competition id, names: ' + err);
		});
		query.on('result', function(result) {
			competition_list.push({ id: result.id, name: result.name });
		});
		query.on('end', function() {
			if (!error_generated) {
				callback(competition_list);
			}
			reportQueryEnded();
		})
	} else if (compDesc.id) {
		// Grabbing one competition only
		console.log('Retrieving competition by ID: ' + compDesc.id);

		var query = getConnection().query('SELECT id, name, is_private, start_date, end_date FROM Competition WHERE id = ?;', compDesc.id);
		reportQueryActive();
		var error_generated = false;
		var result;
		query.on('error', function(err) {
			error_generated = true;
			callback(null, 'SQL - Select competition by id ' + compDesc.id + ': ' + err);
		});
		query.on('result', function(res) {
			result = {
				id: res.id,
				name: res.name,
				is_private: res.is_private[0],
				start_date: res.start_date,
				end_date: res.end_date
			};
		});
		query.on('end', function() {
			reportQueryEnded();
			if (!error_generated) {
				callback(result);
			}
		});
	} else {
		// Catch-all case (if user tries to access a not implemented feature)
		callback(null, 'Case for provided user description not provided in competition_dao.js');
	}
}

function getUpcomingCompetitions(callback) {
	console.log('competition_dao: Getting upcoming competitions list...');
	// NEXT VERSION: Do ALL of your queries like this...
	getConnection().query('SELECT id, name, is_private FROM Competition WHERE start_date > NOW();',
		function(err, rows) {
			if (err) {
				callback(null, 'MYSQL error: ' + err);
			} else {
				callback(rows);
			}
			reportQueryEnded();
		});
	reportQueryActive();
}

function getOngoingCompetitions(callback) {
	console.log('competition_dao: Getting ongoing competitions list...');
	getConnection().query('SELECT id, name, is_private FROM Competition WHERE start_date < NOW() AND end_date > NOW();',
		function(err, rows) {
			if (err) {
				callback(null, 'MYSQL error: ' + err);
			} else {
				callback(rows);
			}
			reportQueryEnded();
		});
	reportQueryActive();
}

function getPreviousCompetitions(callback) {
	console.log('competition_dao: Getting previous competitions list...');
	getConnection().query('SELECT id, name, is_private FROM Competition WHERE end_date < NOW();',
		function(err, rows) {
			if (err) {
				callback(null, 'MYSQL error: ' + err);
			} else {
				callback(rows);
			}
			reportQueryEnded();
		});
	reportQueryActive();
}

function getHTMLFrag(compID, callback) {
	console.log('competition_dao: Retrieving HTML Fragment for competition #' + compID);

	var query = getConnection().query('SELECT htmlfrag_data FROM Competition WHERE id = ?;', compID),
		error_generated = true;
	reportQueryActive();
	query.on('error', function(err) {
		error_generated = true;
		callback(null, 'SQL - Get HTMLFrag for ' + compID + ': ' + err);
	});
	query.on('result', function(result) {
		callback(result.htmlfrag_data);
	});
	query.on('end', function() {
		reportQueryEnded();
	});
}

exports.getCompetitionData = getCompetitionData;
exports.getHTMLFrag = getHTMLFrag;
exports.getUpcomingCompetitions = getUpcomingCompetitions;
exports.getPreviousCompetitions = getPreviousCompetitions;
exports.getOngoingCompetitions = getOngoingCompetitions;