// pixi-silk/ui/inspector: a property inspector built from a schema, bound to objects or signals.

export {
    bindObjects,
    bindSignals,
    type FieldValue,
    fieldValue,
    getPath,
    type InspectorBinding,
    setPath,
    type WritableSignal,
} from './panels/binding';
export {
    ChoiceField,
    type ChoiceFieldOptions,
    type ChoiceOption,
    ColorField,
    type ColorFieldOptions,
    Field,
    type FieldContext,
    type FieldEdit,
    NumberField,
    type NumberFieldOptions,
    TextField,
    type TextFieldOptions,
    ToggleField,
    type ToggleFieldOptions,
    VectorField,
    type VectorFieldOptions,
} from './panels/fields';
export {
    type ChoiceFieldSpec,
    type ColorFieldSpec,
    type ColorPickerFactory,
    Inspector,
    type InspectorField,
    type InspectorOptions,
    type InspectorState,
    type NumberFieldSpec,
    type SectionSpec,
    type TextFieldSpec,
    type ToggleFieldSpec,
    type VectorFieldSpec,
} from './panels/Inspector';
