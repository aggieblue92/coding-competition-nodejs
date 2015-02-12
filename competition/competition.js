'use strict';

var subsystem = {},
	comp_subsystem = {};

var error_page = require('../page_builders/error_page'),
	competition_dao = require('../dao/competition_dao');

/* --------Competition Subsystem-------- *\
	- Anything dealing with any competition passes through this gate
	-- This includes administrative competition functions
	-- This includes viewing problems
	-- This includes submissions

	- This gate is where users are authorized to access a competition
	----- PASS CONDITIONS -----
	: Competition is public and expired
	: Competition is ongoing, user is an admin or peasant
	: Competition is expired and private, user is an admin or peasant
	: Competition is upcoming, user is an admin

	----- FAIL CONDITIONS -----
	: Competition is non-public and user is a guest
	: Competition is upcoming and user is a peasant or guest
	: Competition is ongoing and user is a guest

	------ Competition Subsystems -----
	The function 'route' changes for competition subsystems. Any subsystems
	 that are part of a specific competition (denoted by 'c' followed by a number,
	 like c01, c2, or c123) are instead routed through the comp_subsystem object.
	This behaves like the subsystem object, but the route function should instead have
	 this prototype:

	route(respone, request, remainingPath, compData)

	 where compData is an object with the following properties:
	 {
		id, name, is_private, start_date, end_date
	 }

	This is a nice caching method, don't you think?

	----------- Improvements for V0.3 -----------
	- Cache user authorization statuses - instead of hitting MySQL database each time
	++ Cache competitions in system itself (store for some time all data, check against cached values?)
*/

// Callback:
// callback(result, compData, authNodes, err)
// -result: true if authorized, false if not. compData will be null if not authorized
// -compData: Competition data { id, name, is_private, start_date, end_date }
// -authNotes: if compData is null, reason they were denied access
// -err: If an SQL error occurred, what the SQL error was
function gatekeeper(userData, compID, callback) {
	console.log('---------------GATEKEEPER----------------');
	if (userData) {
		console.log('-- ' + (userData.is_admin ? 'SIR ' + userData.user_name : userData.user_name + ' THE PEASANT') + ' --');
	} else {
		console.log('-- FILTHY GUEST');
	}
	console.log('-- Requesting access to competition: ' + compID + ' --');
	console.log('-----JUDGE WISELY OH THOU HOLY JUDGE-----');

	competition_dao.getCompetitionData({ id: compID }, function(compData, err) {
		if (err) {
			console.log('Failed to get competition data on grounds: ' + err);
			callback(false, null, null, 'competition_dao error: ' + err);
		} else {
			if (compData) {
				if (!userData) {
					auth_guest(compData);
				} else if (!user.is_admin) {
					auth_admin(compData);
				} else {
					auth_peasant(compData);
				}
			} else {
				// NEXT VERSION: Don't tell the callback (in the authNotes, which is client-facing)
				//  why they failed - just say they failed (otherwise people can guess competition IDs)
				callback(false, null, 'No competition found with given ID');
			}
		}
	});

	function auth_admin(compData) {
		console.log('Authorizing admin to competition...');
		console.log('Decision: pass (admin, duh. "Right this way, sir.")');
		callback(true, compData);
	}

	function auth_peasant(compData) {
		console.log('Authorizing peasant to competition...');
		// PASS:
		// Competition is expired (end_date < now)
		// Competition is ongoing (start_date < now < end_date)
		if (Date.parse(compData.end_date) < Date.now()) {
			console.log('Decision: pass (competition has expired)');
			callback(true, compData);
		} else if (Date.parse(compData.end_date) > Date.now() && Date.parse(compData.start_date) < Date.now()) {
			console.log('Decision: pass (competition is ongoing)');
			callback(true, compData);
		} else if (Date.parse(compData.start_date) > Date.now()) {
			console.log('Decision: reject (competition has not yet started)');
			callback(false, null, 'Access Denied - competition has not yet started!');
		} else {
			console.log('Decision: reject (though we don\'t know why');
			callback(false, null, 'Access Denied (though we don\'t know why');
		}
	}

	function auth_guest(compData) {
		console.log('Authorizing filthy guest to competition...');
		if (Date.parse(compData.end_date) < Date.now() && compData.is_public == true) {
			console.log('Decision: pass (competition has expired and is public)');
			callback(true, compData);
		} else if (!compData.is_public) {
			console.log('Decision: fail (competition is private)');
			callback(false, null, 'Access Denied (must be logged in to view this competition)');
		} else {
			console.log('Decision: fail (competition has not yet passed)');
			callback(false, null, 'Access denied (competition is ongoing - must be logged in to view!)');
		}
	}
}

function route(response, request, remainingPath) {
	console.log('Subsystem competition activated - remaining path: ' + remainingPath);

	var subsys_name = remainingPath;
	if (remainingPath && remainingPath.indexOf('/', 1) > 0) {
		subsys_name = remainingPath.substr(0, remainingPath.indexOf('/', 1));
	}

	// Begin routing...
	if (remainingPath && remainingPath !== '') {
		// Check to see if the competition is specified...
		if (/^\/[c]{1}\d+/.test(remainingPath)) {
			console.log('Matches competition description. Checking authorization...');
			// There is a competition specified. Check authorization,
			//  route to subsystem if appropriate
			gatekeeper(request.session.data.user, /^\/[c]{1}\d+/.exec(remainingPath)[0].substr(1),
				function(result, compData, authNotes, err) {
					if (result) {
						// TODO: replace.
						// SQL: Store competition page link or something
						//  I'd like competition pages to be generated.
						//  Rules for generating comeptition pages:
						// Sidebar:
						// --Competition Rules
						// --Competition Splash
						// --Problems in Competition
						// --Submission Queue*
						// --Scoreboard*
						// UserDesc:
						// --User information
						// --Placement
						// --Time remaining in competition
						// --Alerts*
						// Body:
						// --If competition splash: provided in competition (htmlfrag)
						// --Problem pages will be different (though similar)

						// * Use MVVM/Websockets

						if (comp_subsystem[subsys_name]) {
							if (remainingPath.indexOf('/', 1) > 0) {
								comp_subsystem[subsys_name].route(response, request, compData, remainingPath.substr(remainingPath.indexOf('/', 1)));
							} else {
								comp_subsystem[subsys_name].route(response, request, compData);
							}
						} else {
							console.log('Competition ' + subsys_name + ' not found!');
							response.writeHead(404, {'Content-Type': 'text/plain'});
							response.write('404 not found! (Subsystem - competition)');
							response.end();
						}
					} else {
						if (err) {
							console.log('Error authorizing user: ' + err);
							var rpage = error_page.GoronErrorPage(request.session.data.user,
								'User Not Authorized',
								'There was an unexpected error attempting to authorize the current user. '
								+ 'The error itself was unexpected, so I\'m afraid I can\'t share the details of it '
								+ 'with you, this being an early and untested prototype.');
							if (rpage) {
								rpage.render(function(content, error) {
									if (error) {
										console.log('Could not generate rejection page - ' + error);
										response.writeHead(300, {'Content-Type': 'text/plain'});
										response.write('Could not generate page, but you were rejected from authorization for some reason');
										response.end();
									} else {
										response.writeHead(300, {'Content-Type': 'text/html'});
										response.write(content);
										response.end();
									}
								});
							} else {
								console.log('Could not generate rejection page - showing fail message instead');
								response.writeHead(300, {'Content-Type': 'text/plain'});
								response.write('Could not generate page for an unknown reason. You were rejected from authorization for some reason');
								response.end();
							}
						} else {
							console.log('User rejected from competition subsystem: ' + authNotes);
							// Generate rejection page
							var rpage = error_page.GoronErrorPage(request.session.data.user, 'User could not be authorized', authNotes);
							if (rpage) {
								rpage.render(function(content, error) {
									if (error) {
										console.log('Could not generate rejection page - ' + error);
										response.writeHead(300, {'Content-Type': 'text/plain'});
										response.write('Could not generate page, but you were rejected from authorization for some reason');
										response.end();
									} else {
										response.writeHead(300, {'Content-Type': 'text/html'});
										response.write(content);
										response.end();
									}
								});
							} else {
								console.log('Could not generate rejection page - showing fail message instead');
								response.writeHead(300, {'Content-Type': 'text/plain'});
								response.write('Could not generate page for an unknown reason. You were rejected from authorization for some reason');
								response.end();
							}
						}
					}
				});

		} else {
			// Check against subsystems in the regular fashion.
			//  This is for static competition pages.
			if (subsystem[subsys_name]) {
				console.log('Forwarding request to subsystem ' + subsys_name);
				if (remainingPath.indexOf('/', 1) > 0) {
					subsystem[subsys_name].route(response, request, remainingPath.substr(remainingPath.indexOf('/', 1)));
				} else {
					subsystem[subsys_name].route(response, request);
				}
			} else {
				console.log('Subsystem ' + subsys_name + ' not found!');
				response.writeHead(404, {'Content-Type': 'text/plain'});
				response.write('404 not found! (Subsystem - competition)');
				response.end();
			}
		}
	} else {
		console.log('Action not found. Reporting 404 (user)');
		response.writeHead(404, {'Content-Type': 'text/plain'});
		response.write('404 not found! (Subsystem - competition)');
		response.end();
	}
}

exports.route = route;