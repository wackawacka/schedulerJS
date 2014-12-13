
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
	openIconCss: 'glyphicon glyphicon-plus-sign',
	closeIconCss: 'glyphicon glyphicon-minus-sign',
	noChildrenIconCss: 'glyphicon glyphicon-record',
	
	// time formats
	titleFormat: 'dddd, MMMM Do YYYY',
	timeFormat: 'ha',// 'HH:mm',

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


	date = t.getNow();
	resources = options.resources != null ? options.resources : [];
	events = options.events != null ? options.events : [];

	// Main Rendering  -----------------------------------------------------------------------------------
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

		$resources = $('<div class="schedule-resources-container" />').css({'float':'left', width: options.resourcesWidth}).resizable({
			handles: 'e',
			resize: function (event, ui) {
				$contentView.width($el.width() - $resources.width());
			}
		});;
		$el.append($resources)

		$contentView = $('<div class="schedule-content-container" />').mousewheel(function (e, delta) {
			this.scrollLeft -= (delta * 40);
			e.preventDefault();
		});
		$el.append($contentView)

		$header = $('<div class="schedule-content-header" />').css({ overflow: 'hidden' });
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

		renderEvents();
		unfreezeContentHeight(); // undo any lone freezeContentHeight calls

	}

	function renderHeader() {
		var duration = moment.duration(t.getEnd().diff(t.getStart()));
		var minutes = duration.asMinutes();
		var totalSections = minutes / 60;

		var $timeContainer = $('<div />').css({ position: 'relative', width: minutes * options.pixelsPerMinute });
		var $halfTimeContainer = $('<div />').css({ position: 'relative', width: minutes * options.pixelsPerMinute });
		var iTime = t.getStart();
		for (var i = 0; i < totalSections; i++) {
			$timeContainer.append($('<div class="schedule-heading-time" />').text(iTime.format(options.timeFormat)).css({ 'float': 'left', width: (options.pixelsPerMinute * 60) }));
			iTime.add(60, 'm');
		}
		for (var i = 0; i < totalSections*2; i++) {
			iTime.add(30, 'm');
			$halfTimeContainer.append($('<div class="schedule-heading-half-time" />').css({ 'float': 'left', width: (options.pixelsPerMinute * 30) }));
		}
		$contentView.css({'float': 'left', width: $el.width()-$resources.width(), 'overflow-x': 'auto'});
		$header.append($timeContainer);
		$header.append($halfTimeContainer);
		$header.width(minutes * options.pixelsPerMinute);

		$('.schedule-resource-header').height($header.innerHeight() - 1);
	}
	function renderResources() {
		var $resContainer = $('<ul class="list-unstyled" />');
		$resContainer.append($('<li><div class="schedule-resource-header"></div></li>'));
		renderChildResources($resContainer, resources, 0);
		$resources.append($resContainer);

		function renderChildResources($parent, resourceArray, levelDeep) {
			for (var i = 0; i < resourceArray.length; i++) {
				var resource = resourceArray[i];
				var $resContainer = $('<li><div class="schedule-resource-item"></div></li>');
				$resContainer.data('resource', resource);
				$resContainer.attr('resourceid', resource.id);
				var $resItem = $resContainer.children('div');

				if (resource.children && resource.children.length > 0) {
					var $opener = $('<i class="' + (!!resource.openIconCss ? resource.openIconCss : options.openIconCss) + '" />');
					$opener.click(function () {
						var $thisContainer = $(this).parent().parent();
						var resource = $thisContainer.data('resource');
						if ($thisContainer.children('ul').is(':visible')) {
							$thisContainer.children('ul').slideUp();
							$(this).removeClass((!!resource.openIconCss ? resource.openIconCss : options.openIconCss))
							$(this).addClass((!!resource.closeIconCss ? resource.closeIconCss : options.closeIconCss))
						} else {
							$thisContainer.children('ul').slideDown();
							$(this).removeClass((!!resource.closeIconCss ? resource.closeIconCss : options.closeIconCss))
							$(this).addClass((!!resource.openIconCss ? resource.openIconCss : options.openIconCss))
						}
					});
					$resItem.append($opener);
				} else {
					var $opener = $('<i class="' + (!!resource.noChildrenIconCss ? resource.noChildrenIconCss : options.noChildrenIconCss) + '" />');
					$resItem.append($opener);
				}
				$resItem.append($('<span />').text(resourceArray[i].name).css({ paddingLeft: 5 })).append($('<hr />').css({ margin: 0 }));
				$parent.append($resContainer);

				if (resourceArray[i].children && resourceArray[i].children.length > 0) {
					$subContainer = $('<ul class="list-unstyled" />');
					renderChildResources($subContainer, resourceArray[i].children, levelDeep + 1);
					$resContainer.append($subContainer);
				}
			}
		}
	}
	function renderContent() {
		var duration = moment.duration(t.getEnd().diff(t.getStart()));
		var minutes = duration.asMinutes();
		var totalSections = minutes / options.timeIntervalMins;

		var $tmpContainer = $('<div />').css({width: minutes*options.pixelsPerMinute});
		renderChildResourceContent(resources, 0);
		$content.append($tmpContainer);

		function renderChildResourceContent(resourceArray, levelDeep) {
			for (var r = 0; r < resourceArray.length; r++) {
				var iTime = t.getStart();
				var $newRow = $('<div />').data('resource', resourceArray[i]).attr('resourceid', resourceArray[r].id);
				for (var i = 0; i < totalSections; i++) {
					$newContentEl = $('<div class="schedule-content-item dropTarget" />').css({
						'float': 'left',
						position: 'relative',
						width: (options.pixelsPerMinute * options.timeIntervalMins),
						height: $('.schedule-resources-container li[resourceid=' + resourceArray[r].id + '] > div').innerHeight()
					}).attr('datetime', iTime.toISOString());
					$newRow.append($newContentEl);
					iTime.add(options.timeIntervalMins, 'm');
				}
				$tmpContainer.append($newRow);

				if (resourceArray[r].children && resourceArray[r].children.length > 0)
					renderChildResourceContent(resourceArray[r].children, levelDeep + 1);
			}
		}
	}
	function renderEvents() {
		for (i = 0; i < events.length; i++) {
			if (!moment.isMoment(events[i].start)) events[i].start = moment(events[i].start);
			if (!moment.isMoment(events[i].end)) events[i].end = moment(events[i].end);
			
			if (events[i].start.clone().startOf('day').toISOString() != date.startOf('day').toISOString()) continue;

			var $event = $('<div class="event" data-toggle="popover" data-trigger="click"><div class="schedule-event-time-container"><div class="schedule-event-time-indicator"></div></div></div>').append(events[i].name);
			$event.draggable({
				revert: "invalid",
				scroll: true,
				cursorAt: { left: 10 },
				stop: function (event, ui) {
					// event.toElement is the element that was responsible
					// for triggering this event. The handle, in case of a draggable.
					$(event.toElement).one('click', function (e) { e.stopImmediatePropagation(); });
				}
			});
			$event.popover({
				animation: false,
				html: true,
				placement: 'left',
				title:  events[i].name,
				content: events[i].description,
				container: 'body'
			});
			var time = moment.roundMoment(events[i].start, 'minute', options.timeIntervalMins, 'down', true);
			$nearestEl = $content.find('div[resourceid=' + events[i].resourceid + ']').children('div[datetime="' + time.toISOString() + '"]');
			$nearestEl.append($event);
		}
	}
	

	/* Event Fetching/Rendering
	-----------------------------------------------------------------------------*/
	// TODO: going forward, most of this stuff should be directly handled by the view


	function refetchEvents() { // can be called as an API method
		destroyEvents(); // so that events are cleared before user starts waiting for AJAX
		fetchAndRenderEvents();
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

moment.roundMoment = function (m, unit, offset, midpoint, clone) {
	unit = moment.normalizeUnits(unit);

	if (unit.toLowerCase() == 'day')
		unit = 'date';

	offset = offset || 1;
	var value = m.get(unit);

	switch (midpoint) {
		case 'up':
			value = Math.ceil(value / offset);
			break;
		case 'down':
			value = Math.floor(value / offset);
			break;
		case 'nearest':
		default:
			value = Math.round(value / offset);
			break;
	}
	var ret = clone ? m.clone() : m;
	ret = ret.set(unit, value * offset);

	switch (unit) {
		case 'year':
			ret.month(0);
			/* falls through */
		case 'month':
			ret.date(1);
			/* falls through */
		case 'date':
			ret.hours(0);
			/* falls through */
		case 'hour':
			ret.minutes(0);
			/* falls through */
		case 'minute':
			ret.seconds(0);
			/* falls through */
		case 'second':
			ret.milliseconds(0);
			/* falls through */
	}
	return ret;
}
moment.fn.roundTo = function (unit, offset, midpoint) {
	return moment.roundMoment(this, unit, offset, midpoint, false);
};


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