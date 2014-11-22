
if (typeof jQuery === 'undefined') {
	throw new Error('ScheduleJS requires jQuery');
}


$.fn.schedule = function (options) {

	var $this = this;
	var events = [];
	var resources = [];

	if (options.events) events = options.events;
	if (options.resources) resources = options.resources;

	if ($this.data('schedule-initiated')) return;
	$this.data('schedule-initiated', true);

	$this.addClass('ui-widget schedule');

	$this.render = function (date) {
		var dayStart = moment(date.startOf('day'));
		var dayEnd = moment(date.endOf('day'));
		$this.html('');
		var finalHtml = '<div class="text-center ui-widget-header">' + date.format('dddd, MMMM Do YYYY') + '</div>';
		var timeIntervalMins = 60;
		iTime = moment(dayStart);

		finalHtml += '<table width="100%" class="ui-datepicker-calendar"><tr><th></th>';
		while (iTime.isBefore(dayEnd)) {
			iTime.add(timeIntervalMins, 'm');
			finalHtml += '<th>' + iTime.format('hh:mm') + '</th>';
		}

		finalHtml += '</tr>';

		for (var i = 0; i < resources.length; i++) {
			finalHtml += '<tr><td class="ui-accordion-header ui-state-default ui-corner-all ui-accordion-icons">' + resources[i].name + '</td>';

			iTime = moment(dayStart);
			while (iTime.isBefore(dayEnd)) {
				iTime.add(timeIntervalMins, 'm');
				finalHtml += '<td class="dropTarget"></td>';
			}

			finalHtml += '</tr>';
		}

		finalHtml += '</table>';

		$(events).each(function (i, evt) {
			
		});

		$this.html(finalHtml);
	}

	$this.render(moment());

	return $this;

}