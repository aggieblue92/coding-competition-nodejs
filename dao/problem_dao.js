/**
 * Created by Kamaron on 4/22/2015.
 */

exports.get_problem_data = function (prob_id, cb) {
    cb(null, {
        prob_id: prob_id,
        prob_name: 'Test Problem 1',
        test_cases: [{
            number: 0,
            comparison_program: 0
        }, {
            number: 1,
            comparison_program: 1
        }]
    });
};