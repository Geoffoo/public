/* Provide classes for bootstrap 3.x compatibility */
/* See https://github.com/bichotll/Parsley-js-Twitter-Bootstrap-3-configuration */

window.ParsleyConfig = {
  errorClass: 'has-error',
  successClass: 'has-success',
  classHandler: function(ParsleyField) {
    return ParsleyField.$element.parents('.form-group');
  },
  errorsContainer: function(ParsleyField) {
    return ParsleyField.$element.parents('.form-group');
  },
  errorsWrapper: '<span class="help-block">',
  errorTemplate: '<div></div>'
};
