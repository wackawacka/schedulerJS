
if (typeof jQuery === 'undefined') {
	throw new Error('ScheduleJS requires jQuery');
}


//$.fn.schedule = function (options) {

//	var $this = this;
//	//<defaults>
//	var events = [];
//	var resources = [];
//	var currentDate = moment();
//	var timeIntervalMins = 60;
//	var topBarDateFormat = 'dddd, MMMM Do YYYY';
//	//</defaults>

//	if (options.events) events = options.events;
//	if (options.resources) resources = options.resources;
//	if (options.date) currentDate = moment(options.date);
//	if (options.timeIntervalMins) timeIntervalMins = options.timeIntervalMins;
//	if (options.topBarDateFormat) topBarDateFormat = options.topBarDateFormat;

//	if (!currentDate.isValid()) console.log("schedule: invalid 'date' option, try an ISO standard string.");
//	if (isNaN(timeIntervalMins)) console.log("schedule: invalid 'timeIntervalMins' option, this must be a number. The default is 60, this means each drop target is 60 minutes.")

//	if ($this.data('schedule-initiated')) return;
//	$this.data('schedule-initiated', true);

//	$this.addClass('schedule');

//	$this.render = function (date) {
//		var dayStart = moment(date.startOf('day'));
//		var dayEnd = moment(date.endOf('day'));
//		var finalEl = $('<div class="date-bar">' + date.format(topBarDateFormat) + '</div>');
//		var headerHTML = '';

//		var timeIntervalMins = 60;
//		var iTime = moment(dayStart);//must create a new instance of moment so we can adjust it and reset it later.

//		finalHtml += '<div class="resource-header"></div>';
//		while (iTime.isBefore(dayEnd)) {
//			iTime.add(timeIntervalMins, 'm');
//			finalHtml += '<div class="time-header">' + iTime.format('hh:mm') + '</div>';
//		}

//		for (var i = 0; i < resources.length; i++) {
//			finalHtml += '<div class="resource-name">' + resources[i].name + '</div>';

//			iTime = moment(dayStart);
//			while (iTime.isBefore(dayEnd)) {
//				iTime.add(timeIntervalMins, 'm');
//				finalHtml += '<td class="dropTarget"></td>';
//			}

//			finalHtml += '</tr>';
//		}

//		finalHtml += '</table>';

//		$(events).each(function (i, evt) {
			
//		});

//		$this.html(finalHtml);
//	}

//	$this.render(currentDate);

//	return $this;

//}



var s = $.scheduler = { version: 0.1 };

$.fn.scheduler = function (options) {
	var res = this; // what this function will return (this jQuery object by default)

	this.each(function (i, el) { // loop each DOM element involved
		var $el = $(el);
		var schedule = $el.data('scheduler'); // get the existing calendar object (if any)

		if (!schedule) { // don't initialize twice
			schedule = new Schedule($el, options);
			$el.data('scheduler', schedule);
			schedule.render();
		}
	});

	return res;
};

// function for adding/overriding defaults
function setDefaults(d) {
	mergeOptions(defaults, d);
}

// Recursively combines option hash-objects.
function mergeOptions(target) {

	function mergeIntoTarget(name, value) {
		if ($.isPlainObject(value) && $.isPlainObject(target[name]) && !isForcedAtomicOption(name)) {
			// merge into a new object to avoid destruction
			target[name] = mergeOptions({}, target[name], value); // combine. `value` object takes precedence
		}
		else if (value !== undefined) { // only use values that are set and not undefined
			target[name] = value;
		}
	}

	for (var i = 1; i < arguments.length; i++) {
		$.each(arguments[i], mergeIntoTarget);
	}

	return target;
}

// overcome sucky view-option-hash and option-merging behavior messing with options it shouldn't
function isForcedAtomicOption(name) {
	// Any option that ends in "Time" or "Duration" is probably a Duration,
	// and these will commonly be specified as plain objects, which we don't want to mess up.
	return /(Time|Duration)$/.test(name);
}


var defaults = {

	timeIntervalMins: 60,//time between each drop target (so 30 will allow events to be dropped at 3:30)
	defaultEventDurationMins: 120,
	now: moment().startOf('day').add(12, 'h'),
	defaultStart: moment().startOf('day'),
	defaultEnd: moment().endOf('day'),
	pixelsPerMinute: 1,
	resourcesWidth: 200,

	// display
	aspectRatio: 1.35,

	// time formats
	titleFormat: 'dddd, MMMM Do YYYY',
	timeFormat: 'hh:mm',

	// jquery-ui theming
	dragOpacity: .75,
	dragRevertDuration: 500,
	dragScroll: true,

	dropAccept: '*',

	eventLimit: false,
	eventLimitText: 'more',
	eventLimitClick: 'popover',
	dayPopoverFormat: 'LL',

	handleWindowResize: true,
	windowResizeDelay: 200 // milliseconds before a rerender happens

};


function Schedule($el, instanceOptions) {
	var t = this;

	instanceOptions = instanceOptions || {};

	var options = mergeOptions({}, defaults, instanceOptions);

	// Exports
	// -----------------------------------------------------------------------------------

	t.options = options;
	t.render = render;
	t.destroy = destroy;
	t.gotoDate = gotoDate;
	t.getDate = getDate;
	t.option = option;
	t.trigger = trigger;



	// Returns a moment for the current date, as defined by the client's computer,
	// or overridden by the `now` option.
	t.getNow = function () {
		var now = options.now;
		if (typeof now === 'function') {
			now = now();
		}
		return moment(now);
	};
	t.getStart = function () {
		return moment(options.defaultStart);
	}
	t.getEnd = function () {
		return moment(options.defaultEnd);
	}
	t.getResources = function () {
		return resources;
	}
	t.addResource = function (resource) {
		resources.push(resource);
		return resources;
	}
	// Get an event's normalized end date. If not present, calculate it from the defaults.
	t.getEventEnd = function (event) {
		return event.end ? event.end.clone() : t.getDefaultEventEnd(event.start);
	};

	// Given an event's allDay status and start date, return swhat its fallback end date should be.
	t.getDefaultEventEnd = function (start) { // TODO: rename to computeDefaultEventEnd
		return start.clone().add(t.defaultEventDurationMins);
	};

	// Locals         -----------------------------------------------------------------------------------
	var _element = $el[0];
	var $titlebar, $header, $resources, $content;
	var date;
	var events = [];
	var sBarWidth = getScrollbarWidth();
	// Main Rendering  -----------------------------------------------------------------------------------


	date = t.getNow();
	resources = options.resources != null ? options.resources : [];

	function render() {
		if (!$content) {
			initialRender();
		} else if (elementVisible()) {
			// mainly for the public API
			calcSize();
			renderView();
		}
	}
	function initialRender() {
		$el.addClass('schedule');

		$titlebar = $('<div class="schedule-titlebar" />');
		$el.prepend($titlebar);

		$resources = $('<div class="schedule-resources-container" />').css({'float':'left', 'width': options.resourcesWidth});
		$el.append($resources)

		$contentView = $('<div class="schedule-content-container" />');
		$el.append($contentView)

		$header = $('<div class="schedule-content-header" />');
		$contentView.append($header);

		$content = $('<div class="schedule-content-items-container" />');
		$contentView.append($content);


		renderView();

		//if (options.handleWindowResize) {
		//	windowResizeProxy = debounce(windowResize, options.windowResizeDelay); // prevents rapid calls
		//	$(window).resize(windowResizeProxy);
		//}
	}
	function destroy() {
		$titlebar.remove();
		$header.remove();
		$resources.remove();
		$content.remove();
		$el.removeClass('schedule');

		$(window).unbind('resize', windowResizeProxy);
	}
	function elementVisible() {
		return $el.is(':visible');
	}

	// Renders a view because of a date change, view-type change, or for the first time
	function renderView() {

		freezeContentHeight(); // prevent a scroll jump when view element is removed

		$titlebar.text(date.format(options.titleFormat));

		renderResources();
		renderHeader();
		renderContent();

		unfreezeContentHeight(); // undo any lone freezeContentHeight calls

	}

	function renderHeader() {
		var duration = moment.duration(t.getEnd().diff(t.getStart()));
		var minutes = duration.asMinutes();
		var totalSections = minutes / options.timeIntervalMins;

		var $tmpContainer = $('<div />').css({'position': 'relative', width: minutes*options.pixelsPerMinute});
		var iTime = t.getStart();
		for (var i = 0; i < totalSections; i++) {
			iTime.add(options.timeIntervalMins, 'm');
			$tmpContainer.append($('<div class="schedule-heading-time" />').text(iTime.format(options.timeFormat)).css({ 'float': 'left', width: (options.pixelsPerMinute * options.timeIntervalMins) }));
		}
		$contentView.css({'float': 'left', width: $el.width()-$resources.width(), 'overflow-x': 'auto'});
		$header.append($tmpContainer);
	}

	function renderResources() {
		var $tmpContainer = $('<div />');
		$tmpContainer.append($('<div class="schedule-resource-item">&nbsp;</div>'));
		for (var i = 0; i < resources.length; i++) {
			$tmpContainer.append($('<div class="schedule-resource-item" />').text(resources[i].name));
		}
		$resources.html($tmpContainer.html());
		$contentView.css({height: $resources.height()+sBarWidth});
	}

	function renderContent() {
		var duration = moment.duration(t.getEnd().diff(t.getStart()));
		var minutes = duration.asMinutes();
		var totalSections = minutes / options.timeIntervalMins;

		var $tmpContainer = $('<div />').css({width: minutes*options.pixelsPerMinute});
		var iTime = t.getStart();
		for (var r = 0; r < resources.length; r++) {
			var $newRow = $('<div class="alt" />');
			for (var i = 0; i < totalSections; i++) {
				iTime.add(options.timeIntervalMins, 'm');
				$newRow.append($('<div class="schedule-content-item dropTarget" />').css({
					'float': 'left',
					'position': 'relative',
					width: (options.pixelsPerMinute * options.timeIntervalMins),
					height: $('.schedule-resource-item').height()
				}));
			}
			$tmpContainer.append($newRow);
		}

		$content.append($tmpContainer);
	}



	/* Event Fetching/Rendering
	-----------------------------------------------------------------------------*/
	// TODO: going forward, most of this stuff should be directly handled by the view


	function refetchEvents() { // can be called as an API method
		destroyEvents(); // so that events are cleared before user starts waiting for AJAX
		fetchAndRenderEvents();
	}


	function renderEvents() { // destroys old events if previously rendered
		if (elementVisible()) {
			freezeContentHeight();
			currentView.destroyEvents(); // no performance cost if never rendered
			currentView.renderEvents(events);
			unfreezeContentHeight();
		}
	}


	function destroyEvents() {
		freezeContentHeight();
		currentView.destroyEvents();
		unfreezeContentHeight();
	}


	function getAndRenderEvents() {
		if (!options.lazyFetching || isFetchNeeded(currentView.start, currentView.end)) {
			fetchAndRenderEvents();
		}
		else {
			renderEvents();
		}
	}


	function fetchAndRenderEvents() {
		fetchEvents(currentView.start, currentView.end);
		// ... will call reportEvents
		// ... which will call renderEvents
	}


	// called when event data arrives
	function reportEvents(_events) {
		events = _events;
		renderEvents();
	}


	// called when a single event's data has been changed
	function reportEventChange() {
		renderEvents();
	}



	// Selection ----------------------------------------------------------------------------
	function select(start, end) {

		start = t.moment(start);
		if (end) {
			end = t.moment(end);
		}
		else if (start.hasTime()) {
			end = start.clone().add(t.defaultTimedEventDuration);
		}
		else {
			end = start.clone().add(t.defaultAllDayEventDuration);
		}

		currentView.select(start, end);
	}
	function unselect() { // safe to be called before renderView
		if (currentView) {
			currentView.unselect();
		}
	}

	// Date -----------------------------------------------------------------------------
	function prev() {
		renderView(-1);
	}
	function next() {
		renderView(1);
	}
	function today() {
		date = t.getNow();
		renderView();
	}
	function gotoDate(dateInput) {
		date = t.moment(dateInput);
		renderView();
	}
	function incrementDate(delta) {
		date.add(moment.duration(delta));
		renderView();
	}
	// Forces navigation to a view for the given date.
	// `viewName` can be a specific view name or a generic one like "week" or "day".
	function zoomTo(newDate, viewName) {
		var viewStr;
		var match;

		if (!viewName || fcViews[viewName] === undefined) { // a general view name, or "auto"
			viewName = viewName || 'day';
			viewStr = header.getViewsWithButtons().join(' '); // space-separated string of all the views in the header

			// try to match a general view name, like "week", against a specific one, like "agendaWeek"
			match = viewStr.match(new RegExp('\\w+' + capitaliseFirstLetter(viewName)));

			// fall back to the day view being used in the header
			if (!match) {
				match = viewStr.match(/\w+Day/);
			}

			viewName = match ? match[0] : 'agendaDay'; // fall back to agendaDay
		}

		date = newDate;
		changeView(viewName);
	}
	function getDate() {
		return date.clone();
	}

	// Height "Freezing" -----------------------------------------------------------------------------
	function freezeContentHeight() {
		$content.css({
			width: '100%',
			height: $content.height(),
			overflow: 'hidden'
		});
	}
	function unfreezeContentHeight() {
		$content.css({
			width: '',
			height: '',
			overflow: ''
		});
	}

	// Misc -----------------------------------------------------------------------------
	function getScheduler() {
		return t;
	}
	function getView() {
		return currentView;
	}
	function option(name, value) {
		if (value === undefined) {
			return options[name];
		}
		if (name == 'height' || name == 'contentHeight' || name == 'aspectRatio') {
			options[name] = value;
			updateSize(true); // true = allow recalculation of height
		}
	}
	function trigger(name, thisObj) {
		if (options[name]) {
			return options[name].apply(
				thisObj || _element,
				Array.prototype.slice.call(arguments, 2)
			);
		}
	}
}



function debounce(func, wait) {
	var timeoutId;
	var args;
	var context;
	var timestamp; // of most recent call
	var later = function () {
		var last = +new Date() - timestamp;
		if (last < wait && last > 0) {
			timeoutId = setTimeout(later, wait - last);
		}
		else {
			timeoutId = null;
			func.apply(context, args);
			if (!timeoutId) {
				context = args = null;
			}
		}
	};

	return function () {
		context = this;
		args = arguments;
		timestamp = +new Date();
		if (!timeoutId) {
			timeoutId = setTimeout(later, wait);
		}
	};
}

function getScrollbarWidth() {
	var $inner = jQuery('<div style="width: 100%; height:200px;">test</div>'),
        $outer = jQuery('<div style="width:200px;height:150px; position: absolute; top: 0; left: 0; visibility: hidden; overflow:hidden;"></div>').append($inner),
        inner = $inner[0],
        outer = $outer[0];

	jQuery('body').append(outer);
	var width1 = inner.offsetWidth;
	$outer.css('overflow', 'scroll');
	var width2 = outer.clientWidth;
	$outer.remove();

	return (width1 - width2);
}