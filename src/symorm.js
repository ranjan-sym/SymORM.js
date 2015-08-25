/**
 * Created by ranjan on 8/25/15.
 */
var SymORM = new function() {
  function assert(condition, message) {
    if (!condition) {
      throw message || "Assertion failed";
    }
  }

  var database = {};
  var components = {};

  this.loadObject = function(modelObject, parentModelsInformation) {
    var type = modelObject._type;
    var id = modelObject.id;

    // Since a model object can be of more than a single type (parent child),
    // we will make a type an array if it is not an array
    if (! (type instanceof Array)) {
      type = [type];
    }

    var model = null;
    // Check if the given model Object already exists on our database
    for(var i=0; i<type.length; ++i) {
      if (!database.hasOwnProperty(type[i])) {
        database[type[i]] = new ModelInformation(type[i], {});
      }
      var modelDb = database[type[i]].data;

      if (modelDb.hasOwnProperty(id)) {
        model = modelDb[id].data;
      }
    }

    // if this is a completely new model we need to create a new instance
    if (model == null) {
      model = { };
    }

    // Keep the list of model information, we need this if there are any child
    // object that needs to be created later
    var modelInfo = [];
    var info = null;
    // Make sure we update the model information on all the parent-child in the database
    for(var i=0; i<type.length; ++i) {
      var modelDb = database[type[i]].data;
      // first create a model database if one is not available
      if (!modelDb.hasOwnProperty(id)) {
        info = modelDb[id] = new ModelInformation(type[i], model);
      } else {
        info = modelDb[id];
      }

      // update the list of models
      modelInfo.push(info);

      // If there are back references to be updated, need to do it here
      if (parentModelsInformation instanceof Array) {
        for(var j=0; j<parentModelsInformation.length; ++j) {
          info.addBackReference(parentModelsInformation[j]);
        }
      }
    }

    // Finally update the model with its properties
    for(var prop in modelObject) {
      if (modelObject.hasOwnProperty(prop)) {
        // Any property name starting with '_' is considered transient and ignored
        if (prop.indexOf('_') === 0) {
          continue;
        }

        var value = modelObject[prop];
        // The value might be a reference to another model, in which case, we need
        // to iteratively load the referenced model as well.
        // first check if the value is an array then object, the sequence is
        // import as an array is also a object
        if (value instanceof Array) {
          // Many references to be set
          model[prop] = [];
          for(i=0; i<value.length; ++i) {
            model[prop].push(this.loadObject(value[i], modelInfo));
          }
        } else if (value instanceof Object) {
          // Looks like we got a reference here, which means we need to load
          // another object
          model[prop] = this.loadObject(value, modelInfo);
        } else {
          // plain old primitive property
          model[prop] = value;
        }
      }
    }

    return info;
  };

  /** Debug method for checking the database */
  this.dump = function() {
    return database;
  };

  /** An internally used Model information. The structure used in the database */
  function ModelInformation(type, model) {
    assert(model instanceof Object);
    this.type = type;
    this.data = model;        // The database record
    this.backReferences = []; // Links to parent models that have this model as a child
    this.components = {};     // The components that need to be informed when anything changes on this model

    this.addBackReference = function(modelInformation) {
      assert(modelInformation instanceof ModelInformation);
      if (this.backReferences.indexOf(modelInformation) === -1) {
        this.backReferences.push(modelInformation);
      }
    }
  }

  /**
   * Retrieve the internal id used by react component. This id could be used as
   * key in objects for storing components
   *
   * @param component
   * @returns {*}
   */
  function hashComponent(component) {
    return component._reactInternalInstance._rootNodeID;
  }

  /**
   * Register a React component with the ORM for callbacks
   *
   * @param component
   * @param event
   */
  this.registerReactComponent = function(component, event) {
    event.component = component;
    component = hashComponent(component);
    if (!components.hasOwnProperty(component)) {
      components[component] = [];
    }

    // Let's see if this event has already been registered
    if (event.modelInformation.components.hasOwnProperty(component)) {
      // Repeat registering on the same event, not allowed
      console.log("Trying to register event on an existing component. Not Allowed.");
      return;
    }

    // Register the event, keep a reference in the global array for
    // de-registration
    event.modelInformation.components[component] = event;
    components[component].push(event);
  };

  /**
   * Unregister the React component after which no callbacks would be thrown
   * to the component from the ORM
   *
   * @param component
   */
  this.unregisterReactComponent = function(component) {
    component = hashComponent(component);
    // only need to do this if the component is already registered
    if (components.hasOwnProperty(component)) {
      // remove the reference from all the model that is listening for this component
      for(var i=0; i<components[component].length; ++i) {
        var event = components[component][i];
        delete event.modelInformation.components[component];
      }

      // and also clear it from the global list
      delete(components[component]);
    }
  };

  var affectedModels = {};
  var componentsToTrigger = [];

  this.onUpdate = function(model) {
    // We got an object that needs to be updated on the system
    var type = model._type;
    var id = model.id;

    // Let's see if we know this type of model
    if(!database.hasOwnProperty(type)) {
      console.log("Ignoring an update event for unknown model '" + type + "'");
      return;
    }

    // Check if this is a known id
    if (!database[type].data.hasOwnProperty(id)) {
      console.log("Ignoring update event on model '" + type + "' for non existent id - " + id);
      return;
    }

    var record = database[type].data[id];
    // Time to find out the components that need to be triggered
    affectedModels = {};

    // Since we found the difference, we need to accommodate the changes
    accommodate(record, model);

    return affectedModels;
  };

  /**
   * Check if the given source and target field values are different or not.
   * This method checks deep into the source to find out if the source and
   * target is different. It returns as soon as it can figure out that the
   * two are different
   *
   * @param source
   * @param target
   */
  function isDifferent(source, target) {
    // Let's see what is the kind of the value that we are trying to check here
    if (source instanceof Array) {
      if (!(target instanceof Array)) {
        return true;
      }
      // Both are array, so we need to check into both of them now
      if (source.length != target.length) {
        return true;
      }

      for(var i=0; i<source.length; ++i) {
        if (isDifferent(source[i], target[i])) {
          return true;
        }
      }
    } else if (source instanceof Object) {
      assert(target instanceof ModelInformation, "Invalid State of Model Database");
      for(var prop in source) {
        if (source.hasOwnProperty(prop)) {
          if (!target.data.hasOwnProperty(prop)) {
            return true;
          } else {
            return isDifferent(source[prop], target.data[prop]);
          }
        }
      }
    } else {
      return source != target;
    }
  }

  function accommodate(targetObj, source) {
    // update the target with the source and while doing so, also update
    // the components and affected models
    var changedProperties = [];

    for(var prop in source) {
      var propChanged = false;

      if (source.hasOwnProperty(prop)) {
        if (prop.indexOf('_') == 0) {
          continue;
        }

        if (source[prop] instanceof Array) {
          if (!targetObj.data.hasOwnProperty(prop)) {
            targetObj.data[prop] = [];
          }

          // Let's do the addition and subtraction of child models
          var targetToRemove = [];
          for(var i=0; i<targetObj.data[prop].length; ++i) {
            var found = false;
            for(var j=0; j<source[prop].length; ++i) {
              if(targetObj.data[prop][i].data.id == source[prop][j].id) {
                if (accommodate(targetObj.data[prop][i], source[prop][j])) {
                  propChanged = true;
                }
                delete source[prop][j];
                found = true;
                break;
              }
            }
            if (!found) {
              propChanged = true;
              targetToRemove.push(i);
            }
          }

          // remove the members that were not available in the source
          // Notice the iteration using opposite direction, to make sure delete works properly
          for(i=targetToRemove.length-1; i>=0; --i) {
            targetObj.data[prop][targetToRemove[i]].removeBackReference(targetObj);
            delete targetObj.data[prop][targetToRemove[i]];
          }

          // Add all the members that are still there in the source
          var len = targetObj.data[prop].length;
          for(i=0; i<source[prop].length; ++i) {
            propChanged = true;
            targetObj.data[prop][len] = getModelInformation(source[prop][i]._type, source[prop][i].id);
            accommodate(targetObj.data[prop][len], source[prop][i]);
          }
        } else if (source[prop] instanceof Object) {
          // When comparing for an object we need to check if the object has changed
          if (!targetObj.data.hasOwnProperty(prop)
                  || targetObj.data[prop].id != source[prop].id) {
            if (targetObj.data.hasOwnProperty(prop)) {
              targetObj.data[prop].removeBackReference(targetObj);
            }
            propChanged = true;
            targetObj.data[prop] = getModelInformation(source[prop]._type, source[prop].id);
            targetObj.data[prop].addBackReference(targetObj);
          }
          if (accommodate(targetObj.data[prop], source[prop])) {
            propChanged = true;
          }
        } else if (source[prop] === null && targetObj.data.hasOwnProperty(prop)) {
          // null has to be handled a bit differently since there might be an
          // object that needs to be cleared on the target. Note that arrays
          // should not be declared null in the source but should rather be
          // empty array []
          if (targetObj.data[prop] instanceof ModelInformation) {
            targetObj.data[prop].removeBackReference(targetObj);
            delete targetObj.data[prop];
          }
        } else {
          if (targetObj.data[prop] != source[prop]) {
            propChanged = true;
            targetObj.data[prop] = source[prop];
          }
        }

        if (propChanged) {
          changedProperties.push(prop);
        }
      }
    }

    // Let's see what properties have changed and based on that, populate the
    // events array
    for(i=0;i<changedProperties.length; ++i) {
      if (!affectedModels.hasOwnProperty(targetObj.type)) {
        affectedModels[targetObj.type] = {};
      }

      if (!affectedModels[targetObj.type].hasOwnProperty(source.id)) {
        affectedModels[targetObj.type][source.id] = [];
      }

      affectedModels[targetObj.type][source.id].push(changedProperties[i]);
    }

    // If the accommodation has changed this model by anyway, return true
    return changedProperties.length > 0;
  }

  /**
   * Retrieve an existing model from the database, but if one is not found
   * then create a new model information, and also update the affectedModels
   * while doing so
   * @param modelType
   * @param id
   */
  function getModelInformation(modelType, id) {
    var res;
    if (!database.data[modelType].hasOwnProperty(id)) {
      res = database.data[modelType][id] = new ModelInformation(modelType, { });
      // Also update the affectedModels information, this information updates
      // the root level notification
      if (!affectedModels.hasOwnProperty(modelType)) {
        affectedModels[modelType] = {};
      }
      affectedModels[modelType][0] = "root";
    } else {
      res = database.data[modelType][id];
    }

    return res;
  }

  function updateModel(model) {
    var modelData = data[model._type][model.id];

    // if the model is not available in the container, create a new model
    if (modelData == undefined) {
      modelData = data[model._type][model.id] = {};
    }

    // update all the properties of our model in the container
    for(var p in model) {
      if (model.hasOwnProperty(p)) {
        if (p.indexOf('_') === 0) {
          // do not update transient properties that are prefixed with '_'
          continue;
        }

        // in case we find an object here, we need to do a recursive update
        // check if the following feature is needed -> *** throwing addition
        // or removal event as and when required, but after the update event
        // is thrown ***
        if (typeof model[p] == 'object') {
          modelData[p] = {
            _type: model[p]._type,
            _ref: model[p].id
          }
        } else if (model[p] instanceof Array) {
          var type = modelData[p][_type];
          var originalRefs = modelData[p][_ref];
          // The original References are stored for making out changes and a
          // new Array is created for updating the references
          modelData[p][_ref] = [];
          for(var i=0; i<model[p].length; ++i) {
            type = model[p][i]._type;
            modelData[p][_ref].push(model[p][i].id);
          }
          modelData[p][_type] = type;
        } else {
          modelData[p] = model[p];
        }
      }
    }
  }

  //this.onUpdate = function(model) {
  //  var m = data[model._type][model.id];
  //  if (m != undefined) {
  //    var components = m.__components;
  //    updateModel(model);
  //    for(i in components) {
  //      if (components.hasOwnProperty(i)) {
  //        components.setState(m);
  //      }
  //    }
  //  }
  //};

  /**
   * The event called when a new model is inserted in the database (in which
   * case the <b>parentRef</b> is {@code null}) or when a model becomes a part
   * of a parent model.
   *
   * @param model The model which has been added
   * @param parentRef The parentRef which is {@code null} if a model is being
   *                  added to a root otherwise a reference to the parent model
   *                  to which the model has been added
   */
  this.onAddition = function(model, parentRef) {
    // Let's see if we already have the given model
    var existing = data[model._type][model.id] != undefined;
    if (parentRef == null && existing) {
      // this is an update and not a insert
      this.onUpdate(model);
      return;
    }

    // Update the model repo
    updateModel(model);

    if (parentRef != null) {
      // An insert event is provided to the listener on the parent model
      var parent = data[parentRef.model][parentRef.id];
      if (parent != null) {
        var components = parent[parentRef.ref].__components;
        for(var i=0; i<components.length; ++i) {
          var items = components[i].state._items.concat();
          parent[parentRef.ref].__components[i].setState({_items: items});
        }
      }
    } else {
      // TODO This may hit the global listener
    }
  };

  this.onRemoval = function(model, parentRef) {
    if (parentRef == null) {

    }
  }

  this.Event = function(modelType, id, field) {
    assert(database.hasOwnProperty(modelType), "The model type '" + modelType + "' is not available");
    assert(database[modelType].hasOwnProperty(id), "The record '" + id + "' is not available in '" + modelType + "' model");
    // Let's see if there is this field in the in the model
    if (!database[modelType][id].data.hasOwnProperty(field)) {
      console.log("The field '" + field + "' was not found in record '" + id + "' of model '" + modelType + "'");
    }

    this.modelInformation = database[modelType][id];
    this.field = field;
  }
};
