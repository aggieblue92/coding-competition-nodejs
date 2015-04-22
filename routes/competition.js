/**
 * Created by Kamaron on 4/21/2015.
 */

var express = require('express'),
    problem_router = require('./problem');

var router = express.Router();

router.use('/:id', function (req, res, next) {
    // Competition restrictions go here...

    // ID must be an integer...
    if (isNaN(parseInt(req.params.id || {}))) {
        throw new Error('Competition ID ' + req.params.id + ' is not valid!');
    } else {
        console.log('For competition ' + req.params.id + '!');
        next();
    }
});

// Anything under directory '/problem' goes to problem router
router.use('/:id/problem', problem_router);

// Add router endpoints here...
// TODO: Move endpoints to controllers...
router.get('/', function (req, res) {
    throw new Error('No competition specified!');
});

router.get('/:id', function (req, res) {
    res.send('Endpoint for competition ' + req.params.id);
});

module.exports = router;