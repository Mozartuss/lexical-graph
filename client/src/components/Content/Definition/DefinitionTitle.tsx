import { Typography } from 'antd';
import React from 'react';

const DefinitionTitle = (): React.JSX.Element => (
  <Typography.Title className="content__title">Synsets</Typography.Title>
);

export default React.memo(DefinitionTitle);
