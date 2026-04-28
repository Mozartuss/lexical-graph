import { Switch } from 'antd';
import React from 'react';
import { RelationType } from '../../../api/types';
import WordnetAPI from '../../../api/WordnetAPI';

type SwitchGroupProps = {
  type: RelationType;
  checked: boolean;
  onChange: (type: RelationType, checked: boolean) => void;
};

export default function SwitchGroup(props: SwitchGroupProps): React.JSX.Element {
  const {
    type, onChange, checked,
  } = props;
  const switchId = `relation-switch-${type}`;

  return (
    <div className="switches__control">
      <Switch
        id={switchId}
        title={type}
        onChange={(checked) => onChange(type, checked)}
        checked={checked}
        size="small"
      />
      <label htmlFor={switchId} className="switches__label">
        <span
          className="switches__dot"
          style={{ backgroundColor: WordnetAPI.colors[type] }}
          aria-hidden="true"
        />
        <span className="switches__text">
          {type.replace('_', ' ')}
        </span>
      </label>
    </div>
  );
}
